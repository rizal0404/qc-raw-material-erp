import { z } from "zod";
import { IsoDateSchema } from "./dates";
import {
  ClayColumnInputModeSchema,
  ClayOperationCategorySchema,
} from "./clay-report";
import {
  CrusherReportIssueSchema,
  CrusherReportObservationSchema,
} from "./crusher-report";
import { ShiftCodeSchema } from "./vendor-operation";
import { OreVisionDiagnosticsSchema } from "./orevision";

const nullableText = (max: number) => z.string().trim().max(max).nullable();
const nullableNumber = z.number().finite().nullable();
const nullableCount = z.number().int().min(0).max(5000).nullable();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable();

export const ClayPhotoHourlySchema = z.object({
  hour: z.number().int().min(0).max(23),
  retase: nullableCount,
});

export const ClayPhotoColumnSchema = z.object({
  blockKey: z.string().trim().min(1).max(64),
  displayOrder: z.number().int().min(0).max(99),
  headerPrimary: z.string().trim().min(1).max(160),
  headerSecondary: nullableText(160),
  vendorId: z.string().uuid().nullable(),
  sourceId: z.string().uuid().nullable(),
  pileId: z.string().uuid().nullable(),
  vendorNameSnapshot: nullableText(160),
  sourceNameSnapshot: nullableText(160),
  inputMode: ClayColumnInputModeSchema,
  tonPerRetaseSnapshot: z.number().positive().nullable(),
  hourly: z.array(ClayPhotoHourlySchema).max(24),
  totalRetase: nullableCount,
  reviewed: z.boolean(),
});

export const ClayPhotoOperationLogSchema = z.object({
  displayOrder: z.number().int().min(0).max(99),
  startTime: time,
  endTime: time,
  category: ClayOperationCategorySchema,
  description: z.string().trim().min(1).max(1000),
});

export const ClayPhotoReportDraftSchema = z.object({
  schemaVersion: z.literal("1.0"),
  operationDate: IsoDateSchema.nullable(),
  shiftCode: ShiftCodeSchema.nullable(),
  timezone: z.literal("Asia/Makassar"),
  hours: z.array(z.number().int().min(0).max(23)).max(24),
  header: z.object({
    day: nullableText(40),
    operatorName: nullableText(160),
  }),
  production: z.object({
    productionTonnage: nullableNumber,
    runningMinutes: z.number().int().nonnegative().nullable(),
    totalRunningMinutes: z.number().int().nonnegative().nullable(),
    capacityTph: nullableNumber,
    stockPercent: z.number().min(0).max(100).nullable(),
  }),
  operation: z.object({
    pickupLocation: nullableText(240),
    weather: nullableText(120),
    pileFilling: nullableText(160),
  }),
  chemistry: z.object({
    sm: nullableNumber,
    sio2: nullableNumber,
    h2o: nullableNumber,
  }),
  attendance: z.object({
    present: z.number().int().nonnegative().nullable(),
    sick: z.number().int().nonnegative().nullable(),
    overtime: z.number().int().nonnegative().nullable(),
    permission: z.number().int().nonnegative().nullable(),
    leave: z.number().int().nonnegative().nullable(),
  }),
  columns: z.array(ClayPhotoColumnSchema).min(1).max(30),
  operationLogs: z.array(ClayPhotoOperationLogSchema).max(100),
  note: nullableText(4000),
  document: z.object({
    title: nullableText(500),
    formNumber: nullableText(120),
    signedBy: nullableText(200),
    provider: z.string().max(40),
    model: z.string().max(200),
  }),
});

export const ClayPhotoReportWorkerResultSchema = z.object({
  draft: ClayPhotoReportDraftSchema,
  observations: z.array(CrusherReportObservationSchema).max(3000),
  issues: z.array(CrusherReportIssueSchema).max(100),
  parserVersion: z.string().max(32),
  templateVersion: z.string().max(32),
  diagnostics: OreVisionDiagnosticsSchema.optional(),
});

export const ClayPhotoReportImportStatusSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "NEEDS_REVIEW",
  "READY",
  "CONFIRMED",
  "FAILED",
]);

export const ClayPhotoReportImportSchema = z.object({
  id: z.string().uuid(),
  crusherId: z.string().uuid(),
  fileName: z.string(),
  sha256: z.string(),
  status: ClayPhotoReportImportStatusSchema,
  revision: z.number().int(),
  createdAt: z.string(),
  confirmedAt: z.string().nullable(),
  parserVersion: z.string().nullable(),
  templateVersion: z.string().nullable(),
  draft: ClayPhotoReportDraftSchema.nullable(),
  observations: z.array(CrusherReportObservationSchema),
  issues: z.array(CrusherReportIssueSchema),
  error: z.string().nullable(),
  hasAlignedImage: z.boolean(),
  reportId: z.string().uuid().nullable(),
  diagnostics: OreVisionDiagnosticsSchema.nullable().optional(),
});

export const UpdateClayPhotoReportDraftSchema = z.object({
  revision: z.number().int().positive(),
  draft: ClayPhotoReportDraftSchema,
});

export const ConfirmClayPhotoReportSchema = z.object({
  revision: z.number().int().positive(),
  reviewed: z.literal(true),
  draft: ClayPhotoReportDraftSchema.optional(),
});

export type ClayPhotoReportDraft = z.infer<typeof ClayPhotoReportDraftSchema>;
export type ClayPhotoReportImport = z.infer<typeof ClayPhotoReportImportSchema>;
export type ClayPhotoReportWorkerResult = z.infer<
  typeof ClayPhotoReportWorkerResultSchema
>;
