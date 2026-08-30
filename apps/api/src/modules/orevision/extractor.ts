import sharp from "sharp";
import {
  CrusherReportWorkerResultSchema,
  oreVisionToDraft,
  type CrusherReportObservation,
} from "@qc/contracts";
import { AppError } from "../../lib/errors";
import { createOreVisionSettings } from "./settings";
import { callVision } from "./provider";
import { extractionPrompt } from "./prompt";

export async function extractReport(
  bytes: Buffer,
  shiftHours: Record<string, number[]>,
) {
  const store = createOreVisionSettings(),
    settings = await store.read();
  store.checkEndpoint(settings);
  // Decode all supported source formats, apply EXIF orientation and preserve aspect
  // ratio. This is normalization, NOT fabricated grid registration/bounding boxes.
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
  // Both source and aligned previews must stay below the Vercel Function
  // response limit. Provider requests still receive the highest safe version.
  if (aligned.length > 4 * 1024 * 1024)
    aligned = await sharp(aligned)
      .resize({ width: 2200, height: 3000, fit: "inside" })
      .jpeg({ quality: 80, chromaSubsampling: "4:2:0" })
      .toBuffer();
  const content = await callVision(
    settings,
    extractionPrompt(shiftHours),
    aligned,
  );
  let draft;
  try {
    draft = oreVisionToDraft(
      JSON.parse(
        content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""),
      ),
      settings.provider,
      settings.model,
      shiftHours,
    );
  } catch {
    throw new AppError(
      502,
      "OREVISION_REPORT_INVALID",
      "Hasil AI tidak sesuai struktur laporan. Periksa foto/model lalu ulangi parser.",
    );
  }
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
    }),
  };
}
