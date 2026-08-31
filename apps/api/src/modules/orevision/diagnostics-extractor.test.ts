import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OreVisionDiagnosticsSchema } from "@qc/contracts";
import { extractReport } from "./extractor";
import { extractClayReport } from "./clay-extractor";
import { OreVisionExtractionError } from "./diagnostics";
import { createOreVisionSettings } from "./settings";

const shiftHours = { SHIFT_2: [15, 16, 17, 18, 19, 20, 21, 22] };
const limestone = () => ({
  header: { title: "Laporan", company: null, date: "2026-08-30", opRoom: "Operator", shift: "SHIFT_2", startStop: null },
  hours: shiftHours.SHIFT_2,
  vendors: [{ id: "v1", name: "Vendor", records: [{ id: "r1", dt: "07", manualTotal: 1, h15: 1 }], manualHeaderTotal: 1 }],
  logs: [],
  footer: { pileTon: null, fillerTon: null, totalTon: null, runningTime: null, capacityPerHour: null,
    stockPileBarat: null, stockPileTimur: null, totalStock: null, location: null, signedBy: null },
});
const clay = () => ({
  schemaVersion: "1.0", operationDate: "2026-08-30", shiftCode: "SHIFT_2", timezone: "Asia/Makassar",
  hours: shiftHours.SHIFT_2,
  header: { day: null, operatorName: "Operator" },
  production: { productionTonnage: null, runningMinutes: null, totalRunningMinutes: null, capacityTph: null, stockPercent: null },
  operation: { pickupLocation: null, weather: null, pileFilling: null },
  chemistry: { sm: null, sio2: null, h2o: null },
  attendance: { present: null, sick: null, overtime: null, permission: null, leave: null },
  columns: [{ blockKey: "column-1", displayOrder: 0, headerPrimary: "BUFFER", headerSecondary: null,
    vendorId: null, sourceId: null, pileId: null, vendorNameSnapshot: null, sourceNameSnapshot: null,
    inputMode: "BUFFER", tonPerRetaseSnapshot: null, hourly: [{ hour: 15, retase: 1 }], totalRetase: 1, reviewed: false }],
  operationLogs: [], note: null,
  document: { title: "Clay", formNumber: null, signedBy: null, provider: "invented-provider", model: "invented-model" },
});
const completion = (content: string, finish = "stop") => new Response(JSON.stringify({
  choices: [{ finish_reason: finish, message: { content } }],
}));

let temporary = "";
let photo: Buffer;
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), "orevision-evidence-test-"));
  vi.stubEnv("OREVISION_SETTINGS_FILE", join(temporary, "settings.json"));
  vi.stubEnv("OREVISION_PROVIDER", "openai");
  vi.stubEnv("OREVISION_OPENAI_API_KEY", "private-provider-key");
  await createOreVisionSettings().save({
    provider: "openai", model: "test-vision", customEndpoint: "http://localhost:11434/v1/chat/completions",
    systemPrompt: "  Keep unreadable numbers null.  ", temperature: 0, topP: 0.8, maxOutputTokens: 4096,
  });
  photo = await sharp({ create: { width: 30, height: 40, channels: 3, background: "white" } }).png().toBuffer();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

describe.each([
  ["Limestone", extractReport, limestone],
  ["Clay", extractClayReport, clay],
] as const)("%s VLM evidence", (_name, extract, fixture) => {
  it("keeps the exact model JSON, validated original draft and effective input without secrets/images", async () => {
    const modelOutput = fixture();
    const raw = "```json\n" + JSON.stringify(modelOutput) + "\n```";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(raw)));
    const output = await extract(photo, shiftHours);
    const evidence = OreVisionDiagnosticsSchema.parse(output.result.diagnostics);
    expect(evidence).toMatchObject({ version: 1, rawOutput: raw, rawOutputTruncated: false,
      parsedOutput: modelOutput, normalizedDraft: output.result.draft, error: null });
    expect(evidence.input).toMatchObject({ provider: "openai", model: "test-vision",
      systemPrompt: "Keep unreadable numbers null.", temperature: 0, topP: 0.8, maxOutputTokens: 4096,
      image: { width: 30, height: 40, mimeType: "image/jpeg", bytes: output.aligned.length }, shiftHours });
    expect(evidence.input.prompt).toContain("JSON");
    expect(JSON.stringify(evidence)).not.toContain("private-provider-key");
    expect(JSON.stringify(evidence)).not.toContain("data:image");
    expect(JSON.stringify(evidence)).not.toContain(photo.toString("base64"));
    const original = structuredClone(output.result.diagnostics!.normalizedDraft);
    output.result.draft.header.operatorName = "Human correction";
    expect(output.result.diagnostics!.normalizedDraft).toEqual(original);
    expect(output.result.diagnostics!.normalizedDraft).not.toEqual(output.result.draft);
  });

  it("retains invalid JSON on parser failure without treating it as a draft", async () => {
    const raw = '{"unfinished":';
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(raw)));
    const error = await extract(photo, shiftHours).catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(OreVisionExtractionError);
    const failure = error as OreVisionExtractionError;
    expect(failure.diagnostics).toMatchObject({ rawOutput: raw, parsedOutput: null, normalizedDraft: null,
      error: { issues: [{ path: "$", code: "invalid_json" }] } });
    expect(failure.details).toBeUndefined();
    expect(JSON.stringify(failure)).not.toContain("unfinished");
    expect(Object.keys(failure)).not.toContain("diagnostics");
  });

  it("shows schema validation paths alongside the parsed provider object", async () => {
    const parsed = { invalid: true };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(JSON.stringify(parsed))));
    const error = await extract(photo, shiftHours).catch((cause: unknown) => cause) as OreVisionExtractionError;
    expect(error).toBeInstanceOf(OreVisionExtractionError);
    expect(error.diagnostics.parsedOutput).toEqual(parsed);
    expect(error.diagnostics.normalizedDraft).toBeNull();
    expect(error.diagnostics.error?.issues?.length).toBeGreaterThan(0);
    expect(error.diagnostics.error?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "header", code: "invalid_type" }),
    ]));
  });

  it("captures truncated generated text with no partial draft and never provider HTTP errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion('{"partial":', "length")));
    const error = await extract(photo, shiftHours).catch((cause: unknown) => cause) as OreVisionExtractionError;
    expect(error.diagnostics).toMatchObject({ rawOutput: '{"partial":', parsedOutput: null, normalizedDraft: null,
      error: { code: "OREVISION_RESPONSE_TRUNCATED" } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":{"message":"private-provider-key"}}', { status: 401 })));
    const denied = await extract(photo, shiftHours).catch((cause: unknown) => cause) as OreVisionExtractionError;
    expect(denied.diagnostics.rawOutput).toBeNull();
    expect(denied.diagnostics.error?.code).toBe("OREVISION_KEY_REJECTED");
    expect(JSON.stringify(denied.diagnostics)).not.toContain("private-provider-key");
  });

  it("bounds the raw transcript and marks truncation without truncating valid parser input", async () => {
    const raw = JSON.stringify({ ...fixture(), extra: "x".repeat(250001) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(completion(raw)));
    const output = await extract(photo, shiftHours);
    expect(output.result.diagnostics?.rawOutput?.length).toBe(250000);
    expect(output.result.diagnostics?.rawOutputTruncated).toBe(true);
    expect(output.result.diagnostics?.error).toBeNull();
    expect(output.result.draft.header.operatorName).toBe("Operator");
  });
});
