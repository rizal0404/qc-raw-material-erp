import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { callVision, listGeminiModels } from "./provider";
import { geminiModelId } from "./gemini-model";
import { createOreVisionSettings, type EngineSettings } from "./settings";
import { registerOreVisionRoutes } from "./routes";

const settings: EngineSettings = {
  provider: "gemini",
  model: "models/gemini-2.5-flash",
  customEndpoint: "http://localhost:11434/v1/chat/completions",
  systemPrompt: "",
  temperature: null,
  topP: null,
  maxOutputTokens: null,
  keys: { gemini: "private-gemini-test-key" },
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Gemini connection regressions", () => {
  it("keeps an invalid legacy model editable so a supervisor can repair the configuration", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gemini-repair-test-"));
    try {
      const store = createOreVisionSettings({
        OREVISION_SETTINGS_FILE: join(dir, "settings.json"),
        OREVISION_PROVIDER: "gemini",
        OREVISION_MODEL: "google/gemini-legacy",
        OREVISION_GEMINI_API_KEY: "private-existing-key",
      });
      expect(store.view(await store.read()).model).toBe("google/gemini-legacy");
      await store.save({
        provider: "gemini",
        model: "models/gemini-available",
        customEndpoint: settings.customEndpoint,
      });
      expect((await store.read()).model).toBe("gemini-available");
      expect((await store.read()).keys.gemini).toBe("private-existing-key");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it("accepts both Gemini resource names and bare IDs without double models/ in the URL", async () => {
    for (const model of ["gemini-2.5-flash", "models/gemini-2.5-flash"]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        json({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [{ thought: true, text: "internal" }, { text: "PONG" }],
              },
            },
          ],
        }),
      );
      expect(
        await callVision({ ...settings, model }, "ping", undefined, fetcher),
      ).toBe("PONG");
      expect(fetcher.mock.calls[0]![0]).toBe(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      );
      expect(fetcher.mock.calls[0]![1]?.headers).toMatchObject({
        "x-goog-api-key": "private-gemini-test-key",
      });
      expect(
        JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).generationConfig
          .maxOutputTokens,
      ).toBeGreaterThanOrEqual(4096);
      expect(
        JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).generationConfig
          .thinkingConfig,
      ).toEqual({ thinkingBudget: 0 });
    }
  });
  it("uses low thinking for a Gemini 3 connection check without reducing image extraction reasoning", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      json({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "PONG" }] } },
        ],
      }),
    );
    const current = { ...settings, model: "gemini-3.7-flash" };
    await callVision(current, "ping", undefined, fetcher);
    await callVision(current, "extract", Buffer.from("image"), fetcher);
    expect(
      JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).generationConfig
        .thinkingConfig,
    ).toEqual({ thinkingLevel: "low" });
    expect(
      JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).generationConfig,
    ).not.toHaveProperty("thinkingConfig");
  });
  it.each([
    "google/gemini-2.5-flash",
    "https://example.test/model",
    "models/../wrong",
    "models/",
  ])("rejects non-Gemini ID %s before making a request", (model) => {
    expect(() => geminiModelId(model)).toThrow(/ID model Gemini/);
  });
  it.each([
    [404, 400, "OREVISION_MODEL_NOT_FOUND"],
    [401, 400, "OREVISION_KEY_REJECTED"],
    [403, 400, "OREVISION_KEY_REJECTED"],
    [400, 400, "OREVISION_REQUEST_REJECTED"],
    [429, 429, "OREVISION_QUOTA_EXCEEDED"],
    [503, 503, "OREVISION_PROVIDER_UNAVAILABLE"],
  ])(
    "classifies upstream HTTP %i without exposing upstream text",
    async (status, statusCode, code) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
        json(
          {
            error: {
              message: "private-gemini-test-key confidential document",
            },
          },
          status as number,
        ),
      );
      const error = await callVision(
        settings,
        "ping",
        undefined,
        fetcher,
      ).catch((e: unknown) => e);
      expect(error).toMatchObject({
        statusCode,
        code,
        details: { upstreamStatus: status },
      });
      expect(String(error)).not.toContain("private-gemini-test-key");
      expect(String(error)).not.toContain("confidential");
    },
  );
  it("reports a missing key as configuration input, not unavailable service", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(
      callVision({ ...settings, keys: {} }, "ping", undefined, fetcher),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "OREVISION_KEY_REQUIRED",
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("identifies output truncation separately from a missing model", async () => {
    await expect(
      callVision(
        settings,
        "ping",
        undefined,
        vi
          .fn()
          .mockResolvedValue(
            json({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
          ),
      ),
    ).rejects.toMatchObject({ code: "OREVISION_RESPONSE_TRUNCATED" });
  });
  it("retrieves paginated generateContent models and never puts a key in the URL", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          models: [
            {
              name: "models/gemini-test",
              displayName: "Gemini test",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/embedding",
              supportedGenerationMethods: ["embedContent"],
            },
          ],
          nextPageToken: "second page",
        }),
      )
      .mockResolvedValueOnce(
        json({
          models: [
            {
              name: "models/gemini-new",
              supportedGenerationMethods: ["generateContent"],
            },
            {
              name: "models/gemini-test",
              supportedGenerationMethods: ["generateContent"],
            },
          ],
        }),
      );
    expect(
      (await listGeminiModels(settings, fetcher)).map((m) => m.id),
    ).toEqual(["gemini-new", "gemini-test"]);
    expect(String(fetcher.mock.calls[1]![0])).toContain(
      "pageToken=second+page",
    );
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).not.toContain("private-gemini-test-key");
      expect(init?.headers).toEqual({
        "x-goog-api-key": "private-gemini-test-key",
      });
      expect(init?.redirect).toBe("error");
    }
  });
  it("tests and lists using an unsaved key without changing the saved provider", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gemini-routes-test-"));
    const app = Fastify();
    try {
      vi.stubEnv("OREVISION_SETTINGS_FILE", join(dir, "settings.json"));
      const store = createOreVisionSettings();
      await store.save({
        provider: "openai",
        model: "existing-model",
        customEndpoint: settings.customEndpoint,
        apiKey: "other-private-key",
      });
      app.decorate("auth", { requireRoles: () => async () => {} } as any);
      await registerOreVisionRoutes(app);
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          json({
            candidates: [
              {
                finishReason: "STOP",
                content: { parts: [{ text: "Connection successful" }] },
              },
            ],
          }),
        )
        .mockResolvedValueOnce(
          json({
            models: [
              {
                name: "models/gemini-available",
                supportedGenerationMethods: ["generateContent"],
              },
            ],
          }),
        );
      vi.stubGlobal("fetch", fetcher);
      const payload = {
        provider: "gemini" as const,
        model: settings.model,
        customEndpoint: settings.customEndpoint,
        apiKey: settings.keys.gemini,
      };
      const test = await app.inject({
        method: "POST",
        url: "/orevision/test",
        payload,
      });
      expect(test.statusCode).toBe(200);
      expect(test.json().message).toContain("gemini-2.5-flash berhasil");
      const models = await app.inject({
        method: "POST",
        url: "/orevision/models",
        payload,
      });
      expect(models.statusCode).toBe(200);
      expect(models.json().items[0].id).toBe("gemini-available");
      expect((await store.read()).provider).toBe("openai");
      expect((await store.read()).keys.gemini).toBeFalsy();
      expect(test.body + models.body).not.toContain("private-key");
      await store.save(payload);
      expect((await store.read()).model).toBe("gemini-2.5-flash");
    } finally {
      await app.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
