import { z } from "zod";
import { IsoDateSchema } from "./dates";
import { ShiftCodeSchema } from "./vendor-operation";
import { OreVisionDocumentSchema } from "./orevision";

const nullableNumber = z.number().finite().nullable();
const count = z.number().int().min(0).max(5000).nullable();
export function normalizeReportDt(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^(?:AA|DT)\s*[-.]?\s*/, "")
    .replace(/\s/g, "")
    .replace(/^0+(?=\d)/, "");
}
// Printed report columns, separate from live counter's half-hour shift boundaries.
// Register further template shifts here; do not infer columns from photo content.
export const CRUSHER_REPORT_HOURS: Record<string, number[]> = {
  SHIFT_1: [7, 8, 9, 10, 11, 12, 13, 14],
  SHIFT_2: [15, 16, 17, 18, 19, 20, 21, 22],
};
export const CrusherReportIssueSchema = z.object({
  code: z.string(),
  path: z.string(),
  severity: z.enum(["INFO", "WARNING", "ERROR", "BLOCKING"]),
  message: z.string(),
});
export const CrusherReportObservationSchema = z.object({
  fieldPath: z.string().max(300),
  rawText: z.string().max(5000).nullable(),
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  sourceMethod: z.enum([
    "OCR",
    "CV_TALLY",
    "FLEET_MATCH",
    "BUSINESS_RULE",
    "MANUAL",
    "LLM_VISION",
    "TRAINED_MODEL",
  ]),
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  needsReview: z.boolean(),
  // Optional for compatibility with observations produced before parser 0.2.
  confidenceKind: z
    .enum(["UNCALIBRATED", "CALIBRATED", "MODEL_SOFTMAX", "NOT_PROVIDED"])
    .optional(),
  sourceBlockKey: z.string().max(64).optional(),
  sourceRowIndex: z.number().int().positive().optional(),
  geometry: z.enum(["GRID", "GRID_ESTIMATED", "TEMPLATE"]).optional(),
  polygon: z
    .tuple([
      z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
      z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
      z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
      z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
    ])
    .optional(),
});
export const CrusherReportVehicleSchema = z.object({
  rowIndex: z.number().int().positive(),
  dtNo: z.string().max(64),
  retase: count,
  equipmentId: z.string().uuid().nullable().optional(),
  assignmentAaId: z.string().uuid().nullable(),
  reviewed: z.boolean(),
  hourly: z
    .array(z.object({ hour: z.number().int().min(0).max(23), retase: count }))
    .max(24)
    .optional(),
});
export const CrusherReportDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  reportDate: IsoDateSchema.nullable(),
  shiftCode: ShiftCodeSchema.nullable(),
  timezone: z.literal("Asia/Makassar"),
  hours: z.array(z.number().int().min(0).max(23)).max(24),
  header: z.object({
    day: z.string().max(40).nullable(),
    crusherCode: z.string().max(80).nullable(),
    operatorName: z.string().max(200).nullable(),
  }),
  vendors: z
    .array(
      z.object({
        blockKey: z.string().min(1).max(64),
        vendorCode: z.string().max(80),
        vendorId: z.string().uuid().nullable(),
        retaseTotal: count,
        hourly: z
          .array(
            z.object({ hour: z.number().int().min(0).max(23), retase: count }),
          )
          .max(24),
        vehicles: z.array(CrusherReportVehicleSchema).max(100),
      }),
    )
    .max(12),
  production: z.object({
    pileTon: nullableNumber,
    fillerTon: nullableNumber,
    totalTon: nullableNumber,
    runningTimeHours: nullableNumber,
    capacityTph: nullableNumber,
  }),
  pile: z.object({
    baratPercent: nullableNumber,
    timurPercent: nullableNumber,
    totalPercent: nullableNumber,
  }),
  notes: z.object({ raw: z.string().max(20000).nullable() }),
  reportRetaseTotal: count,
  document: OreVisionDocumentSchema.optional(),
});
export const CrusherReportWorkerResultSchema = z.object({
  draft: CrusherReportDraftSchema,
  observations: z.array(CrusherReportObservationSchema).max(3000),
  issues: z.array(CrusherReportIssueSchema).max(100),
  parserVersion: z.string().max(32),
  templateVersion: z.string().max(32),
});
export const CrusherReportImportStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "READY",
  "CONFIRMED",
  "FAILED",
]);
export const CrusherReportImportSchema = z.object({
  id: z.string().uuid(),
  crusherId: z.string().uuid(),
  fileName: z.string(),
  sha256: z.string(),
  status: CrusherReportImportStatusSchema,
  revision: z.number().int(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  parserVersion: z.string().nullable(),
  templateVersion: z.string().nullable(),
  draft: CrusherReportDraftSchema.nullable(),
  observations: z.array(CrusherReportObservationSchema),
  issues: z.array(CrusherReportIssueSchema),
  error: z.string().nullable(),
  hasAlignedImage: z.boolean(),
  reportId: z.string().uuid().nullable(),
});
export const UpdateCrusherReportDraftSchema = z.object({
  revision: z.number().int().positive(),
  draft: CrusherReportDraftSchema,
});
export const ConfirmCrusherReportSchema = z.object({
  revision: z.number().int().positive(),
  reviewed: z.literal(true),
  draft: CrusherReportDraftSchema.optional(),
});
export type CrusherReportDraft = z.infer<typeof CrusherReportDraftSchema>;
export type CrusherReportIssue = z.infer<typeof CrusherReportIssueSchema>;
export type CrusherReportObservation = z.infer<
  typeof CrusherReportObservationSchema
>;
export type CrusherReportImport = z.infer<typeof CrusherReportImportSchema>;
export type CrusherReportWorkerResult = z.infer<
  typeof CrusherReportWorkerResultSchema
>;
