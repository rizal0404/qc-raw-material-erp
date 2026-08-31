import sharp from "sharp";
import { ZodError } from "zod";
import {
  OreVisionDiagnosticsSchema,
  type OreVisionDiagnostics,
} from "@qc/contracts";
import { AppError } from "../../lib/errors";
import type { EngineSettings } from "./settings";
import { visionOutputTokenLimit } from "./provider";

const MAX_RAW_OUTPUT = 250000;

// Keep evidence off AppError.details: ordinary error responses/logs must not
// accidentally publish report text or prompts. Import/preview services opt in.
export class OreVisionExtractionError extends AppError {
  readonly diagnostics!: OreVisionDiagnostics;

  constructor(
    diagnostics: OreVisionDiagnostics,
    statusCode: number,
    code: string,
    message: string,
  ) {
    super(statusCode, code, message);
    this.name = "OreVisionExtractionError";
    Object.defineProperty(this, "diagnostics", { value: diagnostics, enumerable: false });
  }
}

export async function createVisionDiagnostics(
  settings: EngineSettings,
  prompt: string,
  aligned: Buffer,
  shiftHours: Record<string, number[]>,
): Promise<OreVisionDiagnostics> {
  const metadata = await sharp(aligned).metadata();
  return OreVisionDiagnosticsSchema.parse({
    version: 1,
    capturedAt: new Date().toISOString(),
    input: {
      provider: settings.provider,
      model: settings.model,
      systemPrompt: settings.systemPrompt.trim(),
      prompt,
      temperature: settings.temperature,
      topP: settings.topP,
      maxOutputTokens: visionOutputTokenLimit(settings),
      image: {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        mimeType: "image/jpeg",
        bytes: aligned.length,
      },
      shiftHours,
    },
    rawOutput: null,
    rawOutputTruncated: false,
    parsedOutput: null,
    normalizedDraft: null,
    error: null,
  });
}

export function parseVisionOutput(
  content: string,
  diagnostics: OreVisionDiagnostics,
): unknown {
  diagnostics.rawOutput = content.slice(0, MAX_RAW_OUTPUT);
  diagnostics.rawOutputTruncated = content.length > MAX_RAW_OUTPUT;
  const parsed: unknown = JSON.parse(
    content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
  );
  diagnostics.parsedOutput = parsed;
  return parsed;
}

export function extractionFailure(
  diagnostics: OreVisionDiagnostics,
  cause: unknown,
  fallback: { code: string; message: string },
): OreVisionExtractionError {
  const statusCode = cause instanceof AppError ? cause.statusCode : 502;
  const code = cause instanceof AppError ? cause.code : fallback.code;
  const message = cause instanceof AppError ? cause.message : fallback.message;
  // The provider exposes only bounded generated text here, never headers,
  // provider error envelopes, credentials, or hidden thinking parts.
  if (cause instanceof AppError && typeof cause.details?.rawOutput === "string") {
    diagnostics.rawOutput = cause.details.rawOutput.slice(0, MAX_RAW_OUTPUT);
    diagnostics.rawOutputTruncated =
      cause.details.rawOutputTruncated === true ||
      cause.details.rawOutput.length > MAX_RAW_OUTPUT;
  }
  const issues = cause instanceof ZodError
    ? cause.issues.slice(0, 100).map((issue) => ({
        path: issue.path.map(String).join(".").slice(0, 500),
        code: issue.code.slice(0, 100),
        message: issue.message.slice(0, 2000),
      }))
    : cause instanceof SyntaxError
      ? [{ path: "$", code: "invalid_json", message: "Respons VLM bukan JSON yang valid. Periksa output mentah dan batas token." }]
      : undefined;
  diagnostics.error = { code, message, ...(issues ? { issues } : {}) };
  return new OreVisionExtractionError(
    OreVisionDiagnosticsSchema.parse(diagnostics),
    statusCode,
    code,
    message,
  );
}
