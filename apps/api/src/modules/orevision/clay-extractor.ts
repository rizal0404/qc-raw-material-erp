import {
  ClayPhotoReportDraftSchema,
  ClayPhotoReportWorkerResultSchema,
  type CrusherReportObservation,
} from "@qc/contracts";
import { z } from "zod";
import { normalizeReportImage } from "./extractor";
import { callVision } from "./provider";
import { createOreVisionSettings } from "./settings";
import { clayExtractionPrompt } from "./clay-prompt";
import { createVisionDiagnostics, extractionFailure, parseVisionOutput } from "./diagnostics";

export async function extractClayReport(
  bytes: Buffer,
  shiftHours: Record<string, number[]>,
) {
  const store = createOreVisionSettings();
  const settings = await store.read();
  store.checkEndpoint(settings);
  const aligned = await normalizeReportImage(bytes);
  const prompt = clayExtractionPrompt(shiftHours);
  const diagnostics = await createVisionDiagnostics(settings, prompt, aligned, shiftHours);
  let draft;
  try {
    const content = await callVision(settings, prompt, aligned);
    const parsed = z.record(z.string(), z.unknown()).parse(parseVisionOutput(content, diagnostics));
    const document = z.object({
      title: z.unknown().optional(),
      formNumber: z.unknown().optional(),
      signedBy: z.unknown().optional(),
    }).passthrough().nullable().optional().parse(parsed.document);
    draft = ClayPhotoReportDraftSchema.parse({
      ...parsed,
      document: {
        title: document?.title ?? null,
        formNumber: document?.formNumber ?? null,
        signedBy: document?.signedBy ?? null,
        provider: settings.provider,
        model: settings.model,
      },
    });
  } catch (error) {
    throw extractionFailure(diagnostics, error, {
      code: "CLAY_VISION_REPORT_INVALID",
      message: "Hasil AI tidak sesuai struktur laporan Clay. Periksa foto/model lalu ulangi parser.",
    });
  }
  diagnostics.normalizedDraft = structuredClone(draft);

  const observations: CrusherReportObservation[] = [];
  for (const [columnIndex, column] of draft.columns.entries()) {
    for (const field of ["headerPrimary", "headerSecondary", "totalRetase"] as const)
      observations.push({
        fieldPath: `columns.${columnIndex}.${field}`,
        rawText: column[field] == null ? null : String(column[field]),
        value: column[field],
        sourceMethod: "LLM_VISION",
        confidence: 0,
        confidenceKind: "NOT_PROVIDED",
        bbox: null,
        needsReview: true,
        sourceBlockKey: column.blockKey,
      });
    for (const [hourIndex, cell] of column.hourly.entries())
      observations.push({
        fieldPath: `columns.${columnIndex}.hourly.${hourIndex}.retase`,
        rawText: cell.retase == null ? null : String(cell.retase),
        value: cell.retase,
        sourceMethod: "LLM_VISION",
        confidence: 0,
        confidenceKind: "NOT_PROVIDED",
        bbox: null,
        needsReview: true,
        sourceBlockKey: column.blockKey,
        sourceRowIndex: hourIndex + 1,
      });
  }

  return {
    aligned,
    result: ClayPhotoReportWorkerResultSchema.parse({
      draft,
      observations,
      issues: [
        {
          code: "CLAY_VISION_REVIEW_REQUIRED",
          path: "columns",
          severity: "WARNING",
          message:
            "Ekstraksi VLM wajib diperiksa terhadap foto. Tandai setiap kolom setelah header dan turus per jam benar.",
        },
      ],
      parserVersion: "orevision-clay-1.0.0",
      templateVersion: "clay-daily-report-1.0",
      diagnostics,
    }),
  };
}
