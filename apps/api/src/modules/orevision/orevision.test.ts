import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import Fastify from "fastify";
import {
  CrusherReportDraftSchema,
  CrusherReportWorkerResultSchema,
  OreVisionSettingsSchema,
  draftToOreVision,
  oreVisionToDraft,
} from "@qc/contracts";
import { callVision, visionOutputTokenLimit } from "./provider";
import { createOreVisionSettings, type EngineSettings } from "./settings";
import { extractReport } from "./extractor";
import { registerOreVisionRoutes } from "./routes";

function report() {
  return {
    header: {
      title: "Laporan",
      company: "Tonasa",
      date: "2026-08-27",
      opRoom: "Ismail",
      shift: "Siang / Sore",
      startStop: "15:00 - 21:37",
    },
    hours: [15, 16, 17, 18, 19, 20, 21, 22],
    vendors: [
      {
        id: "batara",
        name: "BATARA",
        records: [
          {
            id: "b1",
            dt: "07",
            h15: 1,
            h16: 0,
            h17: 0,
            h18: 0,
            h19: 0,
            h20: 0,
            h21: 0,
            h22: null,
            manualTotal: 1,
          },
        ],
        manualHeaderTotal: 1,
      },
    ],
    logs: [{ time: "15:55", text: "METAL DETECTOR TRIP", type: "warning" }],
    footer: {
      pileTon: 100,
      fillerTon: 0,
      totalTon: 100,
      runningTime: 2,
      capacityPerHour: 50,
      stockPileBarat: 20,
      stockPileTimur: 30,
      totalStock: 50,
      location: "Biring Ere",
      signedBy: "Ismail",
    },
  };
}
const settings: EngineSettings = {
  provider: "openai",
  model: "gpt-4o",
  customEndpoint: "http://localhost:11434/v1/chat/completions",
  systemPrompt: "",
  temperature: null,
  topP: null,
  maxOutputTokens: null,
  keys: { openai: "secret-test" },
};
const completion = (content: string, finish = "stop") =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finish, message: { content } }],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("OreVision canonical adapter", () => {
  it("preserves leading zeros, duplicate rows, nulls, full metadata, logs and hourly counts across save/export", () => {
    const input = report();
    input.vendors[0]!.records.push({
      ...input.vendors[0]!.records[0]!,
      id: "b2",
    });
    const draft = CrusherReportDraftSchema.parse(
      oreVisionToDraft(input, "openai", "gpt-4o"),
    );
    expect(draft.vendors[0]!.vehicles.map((r) => r.dtNo)).toEqual(["07", "07"]);
    expect(draft.vendors[0]!.hourly[7]!.retase).toBeNull();
    expect(draft.vendors[0]!.hourly[1]!.retase).toBe(0);
    expect(draft.vendors[0]!.vehicles[0]!.reviewed).toBe(false);
    expect(draft.document?.signedBy).toBe("Ismail");
    draft.header.operatorName = "Koreksi";
    const exported = draftToOreVision(draft);
    expect(exported.header.opRoom).toBe("Koreksi");
    expect(exported.logs).toEqual(input.logs);
    expect(exported.footer).toEqual(input.footer);
  });
  it("supports morning columns and leaves unsupported shift unresolved", () => {
    const input = report();
    input.header.shift = "SHIFT_1";
    input.hours = [7, 8, 9, 10, 11, 12, 13, 14];
    const draft = oreVisionToDraft(input, "gemini", "model");
    expect(draft.shiftCode).toBe("SHIFT_1");
    expect(draft.hours[0]).toBe(7);
    expect(draft.vendors[0]!.hourly[0]!.retase).toBeNull();
    input.header.shift = "SHIFT_3";
    expect(oreVisionToDraft(input, "gemini", "model").shiftCode).toBeNull();
  });
  it("rejects malformed or hallucinated payloads instead of falling back to sample data", () => {
    expect(() =>
      oreVisionToDraft({ vendors: [] }, "gemini", "model"),
    ).toThrow();
    const input = report();
    (input.vendors[0]!.records[0] as any).h15 = "1";
    expect(() => oreVisionToDraft(input, "gemini", "model")).toThrow();
  });
});

describe("OreVision providers", () => {
  it.each(["openai", "openrouter", "custom"] as const)(
    "forwards image tuning and a distinct system instruction to %s",
    async (provider) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion("{}"));
      await callVision(
        {
          ...settings,
          provider,
          keys: { [provider]: "secret-test" },
          systemPrompt: "  Preserve unreadable values as null.  ",
          temperature: 0,
          topP: 0.8,
          maxOutputTokens: 12000,
        },
        "Built-in extraction JSON schema",
        Buffer.from("image"),
        fetcher,
      );
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "Preserve unreadable values as null.",
      });
      expect(body.messages[1].role).toBe("user");
      expect(body.messages[1].content[0].text).toBe(
        "Built-in extraction JSON schema",
      );
      expect(body).toMatchObject({
        temperature: 0,
        top_p: 0.8,
        max_tokens: 12000,
      });
      expect(body.response_format).toEqual({ type: "json_object" });
    },
  );
  it.each(["openai", "openrouter", "custom", "gemini"] as const)(
    "does not apply document tuning to a %s connection check",
    async (provider) => {
      const response =
        provider === "gemini"
          ? new Response(
              JSON.stringify({
                candidates: [
                  {
                    finishReason: "STOP",
                    content: { parts: [{ text: "PONG" }] },
                  },
                ],
              }),
            )
          : completion("PONG");
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await callVision(
        {
          ...settings,
          provider,
          model: provider === "gemini" ? "gemini-2.5-flash" : settings.model,
          keys: { [provider]: "secret-test" },
          systemPrompt: "Extract the report; never answer PONG.",
          temperature: 1.5,
          topP: 0.2,
          maxOutputTokens: 32000,
        },
        "ping",
        undefined,
        fetcher,
      );
      const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
      expect(JSON.stringify(body)).not.toContain("never answer");
      if (provider === "gemini") {
        expect(body).not.toHaveProperty("systemInstruction");
        expect(body.generationConfig.maxOutputTokens).toBe(4096);
        expect(body.generationConfig).not.toHaveProperty("temperature");
        expect(body.generationConfig).not.toHaveProperty("topP");
      } else {
        expect(body.messages).toEqual([{ role: "user", content: "ping" }]);
        expect(body.max_tokens).toBe(128);
        expect(body).not.toHaveProperty("temperature");
        expect(body).not.toHaveProperty("top_p");
      }
    },
  );
  it("uses native Gemini systemInstruction and generation config for image tuning", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "{}" }] } },
          ],
        }),
      ),
    );
    await callVision(
      {
        ...settings,
        provider: "gemini",
        model: "gemini-2.5-flash",
        keys: { gemini: "test" },
        systemPrompt: "Keep zero distinct from blank.",
        temperature: 0.1,
        topP: 0.9,
        maxOutputTokens: 32000,
      },
      "Extract JSON",
      Buffer.from("image"),
      fetcher,
    );
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]?.body));
    expect(body.systemInstruction).toEqual({
      parts: [{ text: "Keep zero distinct from blank." }],
    });
    expect(body.contents[0].parts[0]).toEqual({ text: "Extract JSON" });
    expect(body.generationConfig).toMatchObject({
      responseMimeType: "application/json",
      temperature: 0.1,
      topP: 0.9,
      maxOutputTokens: 32000,
    });
  });
  it("keeps legacy output budgets when tuning is reset", () => {
    expect(visionOutputTokenLimit(settings)).toBe(16000);
    expect(visionOutputTokenLimit({ ...settings, provider: "gemini" })).toBe(
      24000,
    );
    expect(visionOutputTokenLimit({ ...settings, provider: "custom" })).toBe(
      8192,
    );
    expect(visionOutputTokenLimit({ ...settings, maxOutputTokens: 4096 })).toBe(
      4096,
    );
  });
  it("retains bounded generated text on truncation without retaining the response envelope", async () => {
    const output = "x".repeat(250001);
    const error = await callVision(
      settings,
      "extract",
      Buffer.from("image"),
      vi.fn().mockResolvedValue(completion(output, "length")),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "OREVISION_RESPONSE_TRUNCATED",
      details: {
        rawOutput: "x".repeat(250000),
        rawOutputTruncated: true,
        finishReason: "length",
      },
    });
    expect(JSON.stringify(error)).not.toContain("secret-test");
    expect(JSON.stringify(error)).not.toContain("choices");
  });
  it("never includes Gemini thought parts in failed-run output", async () => {
    const error = await callVision(
      {
        ...settings,
        provider: "gemini",
        model: "gemini-2.5-flash",
        keys: { gemini: "test" },
      },
      "extract",
      Buffer.from("image"),
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            candidates: [
              {
                finishReason: "MAX_TOKENS",
                content: {
                  parts: [
                    { thought: true, text: "private reasoning" },
                    { text: "partial JSON" },
                  ],
                },
              },
            ],
          }),
        ),
      ),
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({
      details: { rawOutput: "partial JSON", rawOutputTruncated: false },
    });
    expect(JSON.stringify(error)).not.toContain("private reasoning");
  });
  it.each(["openai", "openrouter", "custom"] as const)(
    "sends JPEG vision payload to %s",
    async (provider) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(completion('{"ok":true}'));
      await callVision(
        { ...settings, provider, keys: { [provider]: "secret-test" } },
        "Return JSON",
        Buffer.from("image"),
        fetcher,
      );
      const [url, request] = fetcher.mock.calls[0]!;
      expect(String(url)).not.toContain("secret-test");
      expect(request?.redirect).toBe("error");
      expect(
        JSON.parse(String(request?.body)).messages[0].content[1].image_url.url,
      ).toBe("data:image/jpeg;base64,aW1hZ2U=");
      expect(JSON.parse(String(request?.body)).model).toBe("gpt-4o");
      expect(JSON.parse(String(request?.body))).not.toHaveProperty(
        "temperature",
      );
      expect(JSON.parse(String(request?.body))).not.toHaveProperty("top_p");
    },
  );
  it("uses Gemini inlineData and header auth rather than putting the key in a URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "PONG" }] } },
          ],
        }),
      ),
    );
    expect(
      await callVision(
        { ...settings, provider: "gemini", keys: { gemini: "private-key" } },
        "ping",
        undefined,
        fetcher,
      ),
    ).toBe("PONG");
    expect(String(fetcher.mock.calls[0]![0])).not.toContain("private-key");
    expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({
      "x-goog-api-key": "private-key",
    });
  });
  it("rejects incomplete JSON, refusal, HTTP errors and network failures without exposing provider bodies", async () => {
    for (const response of [
      completion("{}", "length"),
      new Response("secret-test full provider error", { status: 401 }),
      completion(""),
    ]) {
      await expect(
        callVision(
          settings,
          "prompt",
          Buffer.from("image"),
          vi.fn().mockResolvedValue(response),
        ),
      ).rejects.toBeInstanceOf(Error);
    }
    await expect(
      callVision(
        settings,
        "prompt",
        undefined,
        vi.fn().mockRejectedValue(new Error("secret-test")),
      ),
    ).rejects.not.toThrow("secret-test");
    await expect(
      callVision({ ...settings, keys: {} }, "prompt"),
    ).rejects.toMatchObject({ code: "OREVISION_KEY_REQUIRED" });
  });
});

describe("OreVision configuration and inline extractor", () => {
  it("defaults legacy settings and preserves omitted tuning until it is explicitly reset", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orevision-tuning-test-"));
    try {
      const path = join(dir, "settings.json");
      await writeFile(
        path,
        JSON.stringify({
          provider: "openai",
          model: "gpt-4o",
          customEndpoint: settings.customEndpoint,
          keys: { openai: "private-old-key" },
        }),
      );
      const store = createOreVisionSettings({ OREVISION_SETTINGS_FILE: path });
      expect(store.view(await store.read())).toMatchObject({
        systemPrompt: "",
        temperature: null,
        topP: null,
        maxOutputTokens: null,
      });
      const input = {
        provider: "openai" as const,
        model: "gpt-4o",
        customEndpoint: settings.customEndpoint,
      };
      const tuned = await store.save({
        ...input,
        systemPrompt: "Preserve nulls",
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: 12000,
      });
      expect(tuned).toMatchObject({
        systemPrompt: "Preserve nulls",
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: 12000,
      });
      expect(JSON.stringify(tuned)).not.toContain("private-old-key");
      expect(await store.save(input)).toMatchObject({
        systemPrompt: "Preserve nulls",
        temperature: 0,
        topP: 0.9,
        maxOutputTokens: 12000,
      });
      expect(
        await store.save({
          ...input,
          systemPrompt: "",
          temperature: null,
          topP: null,
          maxOutputTokens: null,
        }),
      ).toMatchObject({
        systemPrompt: "",
        temperature: null,
        topP: null,
        maxOutputTokens: null,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it.each([
    { systemPrompt: "x".repeat(12001) },
    { temperature: -1 },
    { temperature: 2.1 },
    { temperature: Number.NaN },
    { topP: 0 },
    { topP: 1.1 },
    { maxOutputTokens: 0 },
    { maxOutputTokens: 65537 },
    { maxOutputTokens: 300.5 },
  ])("rejects invalid tuning %#", (tuning) => {
    expect(
      OreVisionSettingsSchema.safeParse({ ...settings, ...tuning }).success,
    ).toBe(false);
  });
  it("persists per-provider keys, redacts reads and permits only server-allowlisted custom endpoints", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orevision-test-"));
    try {
      const store = createOreVisionSettings({
        OREVISION_SETTINGS_FILE: join(dir, "settings.json"),
        OREVISION_CUSTOM_ENDPOINTS: settings.customEndpoint,
      });
      await store.save({
        provider: "openai",
        model: "gpt-4o",
        customEndpoint: settings.customEndpoint,
        apiKey: "key-one",
      });
      await store.save({
        provider: "gemini",
        model: "gemini-2.5-flash",
        customEndpoint: settings.customEndpoint,
        apiKey: "key-two",
      });
      await store.save({
        provider: "openai",
        model: "gpt-4o-mini",
        customEndpoint: settings.customEndpoint,
      });
      const persisted = await store.read();
      expect(persisted.keys.openai).toBe("key-one");
      expect(persisted.keys.gemini).toBe("key-two");
      expect(JSON.stringify(store.view(persisted))).not.toContain("key-one");
      expect(store.view(persisted).configuredProviders).toEqual([
        "gemini",
        "openai",
      ]);
      await expect(
        store.resolveInput({
          provider: "custom",
          model: "model",
          customEndpoint: "http://169.254.169.254/v1/chat/completions",
        }),
      ).rejects.toMatchObject({ code: "OREVISION_ENDPOINT_NOT_ALLOWED" });
      await store.save({
        provider: "openai",
        model: "gpt-4o",
        customEndpoint: settings.customEndpoint,
        apiKey: "",
      });
      expect((await store.read()).keys.openai).toBe("");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("normalizes PNG to JPEG and returns the validated extraction contract with no invented scores/crops", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orevision-inline-test-"));
    try {
      vi.stubEnv("OREVISION_SETTINGS_FILE", join(dir, "settings.json"));
      vi.stubEnv("OREVISION_PROVIDER", "openai");
      vi.stubEnv("OREVISION_OPENAI_API_KEY", "test");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(completion(JSON.stringify(report()))),
      );
      const bytes = await sharp({
        create: { width: 30, height: 40, channels: 3, background: "white" },
      })
        .png()
        .toBuffer();
      const result = await extractReport(bytes, {
        SHIFT_2: [15, 16, 17, 18, 19, 20, 21, 22],
      });
      expect((await sharp(result.aligned).metadata()).format).toBe("jpeg");
      expect(
        CrusherReportWorkerResultSchema.parse(result.result).parserVersion,
      ).toBe("orevision-1.0.0");
      expect(result.result.observations[0]).toMatchObject({
        sourceMethod: "LLM_VISION",
        confidenceKind: "NOT_PROVIDED",
        bbox: null,
        needsReview: true,
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("guards settings writes and connection tests with supervisor authorization", async () => {
    const app = Fastify();
    app.decorate("auth", {
      requireRoles:
        (...roles: string[]) =>
        async (request: any, reply: any) => {
          if (!roles.includes(request.headers["x-role"]))
            return reply.code(403).send({ ok: false });
        },
    } as any);
    await registerOreVisionRoutes(app);
    await app.ready();
    for (const role of ["VENDOR", "CRUSHER_OPERATOR", "QC_ANALYST"])
      for (const [method, url] of [
        ["PUT", "/orevision/settings"],
        ["POST", "/orevision/test"],
        ["POST", "/orevision/models"],
      ] as const)
        expect(
          (
            await app.inject({
              method,
              url,
              headers: { "x-role": role },
              payload: {},
            })
          ).statusCode,
        ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/orevision/settings",
          headers: { "x-role": "VENDOR" },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });
});
