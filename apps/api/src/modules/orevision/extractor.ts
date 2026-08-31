import sharp from "sharp";
import {
  CrusherReportWorkerResultSchema,
  oreVisionToDraft,
  type CrusherReportObservation,
} from "@qc/contracts";
import { createOreVisionSettings } from "./settings";
import { callVision } from "./provider";
import { extractionPrompt } from "./prompt";
import { createVisionDiagnostics, extractionFailure, parseVisionOutput } from "./diagnostics";

export async function normalizeReportImage(bytes: Buffer) {
  // Shared normalization for all crusher report templates. It corrects EXIF
  // orientation and bounds provider payload size without inventing geometry.
  let aligned = await sharp(bytes, {
    limitInputPixels: 24_000_000,
    failOn: "warning",
  })
    .rotate()
    .resize({
      width: 2600,
      height: 3400,
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: "white" })
    .jpeg({ quality: 90, chromaSubsampling: "4:2:0" })
    .toBuffer();
  if (aligned.length > 4 * 1024 * 1024)
    aligned = await sharp(aligned)
      .resize({ width: 2200, height: 3000, fit: "inside" })
      .jpeg({ quality: 80, chromaSubsampling: "4:2:0" })
      .toBuffer();
  return aligned;
}

export async function extractReport(
  bytes: Buffer,
  shiftHours: Record<string, number[]>,
) {
  const store = createOreVisionSettings(),
    settings = await store.read();
  store.checkEndpoint(settings);
  const aligned = await normalizeReportImage(bytes);
  const prompt = extractionPrompt(shiftHours);
  const diagnostics = await createVisionDiagnostics(settings, prompt, aligned, shiftHours);
  let draft;
  try {
    const content = await callVision(settings, prompt, aligned);
    draft = oreVisionToDraft(
      parseVisionOutput(content, diagnostics),
      settings.provider,
      settings.model,
      shiftHours,
    );
  } catch (error) {
    throw extractionFailure(diagnostics, error, {
      code: "OREVISION_REPORT_INVALID",
      message: "Hasil AI tidak sesuai struktur laporan. Periksa foto/model lalu ulangi parser.",
    });
  }
  diagnostics.normalizedDraft = structuredClone(draft);
  const observations: CrusherReportObservation[] = [];
  for (const [vi, vendor] of draft.vendors.entries())
    for (const [ri, row] of vendor.vehicles.entries()) {
      for (const field of ["dtNo", "retase"] as const)
        observations.push({
          fieldPath: `vendors.${vi}.vehicles.${ri}.${field}`,
          value: row[field],
          rawText: row[field] == null ? null : String(row[field]),
          sourceMethod: "LLM_VISION",
          confidence: 0,
          confidenceKind: "NOT_PROVIDED",
          bbox: null,
          needsReview: true,
          sourceBlockKey: vendor.blockKey,
          sourceRowIndex: row.rowIndex,
        });
    }
  return {
    aligned,
    result: CrusherReportWorkerResultSchema.parse({
      draft,
      observations,
      issues: [
        {
          code: "VISION_REVIEW_REQUIRED",
          path: "vendors",
          severity: "WARNING",
          message:
            "Ekstraksi AI perlu pemeriksaan manusia; model tidak menyediakan skor akurasi atau koordinat crop terverifikasi.",
        },
      ],
      parserVersion: "orevision-1.0.0",
      templateVersion: "vision-report-1.0",
      diagnostics,
    }),
  };
}
