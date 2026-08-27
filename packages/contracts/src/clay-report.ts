import { z } from 'zod';

const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const NullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const NullableNonNegative = z.coerce.number().nonnegative().nullable().optional();

export const ClayReportStatusSchema = z.enum(['DRAFT', 'SUBMITTED', 'APPROVED', 'SUPERSEDED']);
export const ClayColumnInputModeSchema = z.enum(['MASTER', 'MANUAL', 'BUFFER']);
export const ClayColumnStatusSchema = z.enum(['PROVISIONAL', 'CONFIRMED', 'INACTIVE']);
export const ClayOperationCategorySchema = z.enum(['SHIFT_CHANGE', 'STOP', 'BREAKDOWN', 'MAINTENANCE', 'NOTE']);

export const ClayReportContextSchema = z.object({
  operationDate: DateSchema,
  shiftCode: z.string().trim().min(1).max(32),
  crusherId: z.string().uuid(),
});

export const PatchClayReportRequestSchema = z.object({
  operatorNameSnapshot: NullableText(160), productionTonnage: NullableNonNegative,
  runningMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  totalRunningMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  capacityTph: NullableNonNegative, stockPercent: z.coerce.number().min(0).max(100).nullable().optional(),
  pickupLocation: NullableText(240), weather: NullableText(120), pileFilling: NullableText(160),
  sm: z.coerce.number().nullable().optional(), sio2: z.coerce.number().nullable().optional(), h2o: z.coerce.number().nullable().optional(),
  attendancePresent: z.coerce.number().int().nonnegative().nullable().optional(),
  attendanceSick: z.coerce.number().int().nonnegative().nullable().optional(),
  attendanceOvertime: z.coerce.number().int().nonnegative().nullable().optional(),
  attendancePermission: z.coerce.number().int().nonnegative().nullable().optional(),
  attendanceLeave: z.coerce.number().int().nonnegative().nullable().optional(),
  note: NullableText(4000),
});

const ClayColumnWriteSchema = z.object({
  displayOrder: z.coerce.number().int().min(0).max(99),
  vendorId: z.string().uuid().nullable().optional(), sourceId: z.string().uuid().nullable().optional(), pileId: z.string().uuid().nullable().optional(),
  vendorNameSnapshot: NullableText(160), sourceNameSnapshot: NullableText(160),
  headerPrimary: z.string().trim().min(1).max(160), headerSecondary: NullableText(160),
  inputMode: ClayColumnInputModeSchema.default('MASTER'),
  tonPerRetaseSnapshot: z.coerce.number().positive().nullable().optional(),
});
export const CreateClayColumnRequestSchema = ClayColumnWriteSchema.superRefine((value, ctx) => {
  if (!value.vendorId && !value.sourceId && !value.vendorNameSnapshot && !value.sourceNameSnapshot && value.inputMode !== 'BUFFER') {
    ctx.addIssue({ code: 'custom', message: 'Pilih master atau isi nama vendor/sumber manual.' });
  }
  if (value.inputMode === 'MASTER' && !value.vendorId && !value.sourceId) {
    ctx.addIssue({ code: 'custom', message: 'Mode master memerlukan vendor atau sumber dari master data.', path: ['inputMode'] });
  }
  if (value.inputMode === 'MANUAL' && !value.vendorNameSnapshot && !value.sourceNameSnapshot) {
    ctx.addIssue({ code: 'custom', message: 'Mode manual memerlukan nama vendor atau sumber.', path: ['inputMode'] });
  }
});

export const UpdateClayColumnRequestSchema = ClayColumnWriteSchema.partial().extend({
  status: ClayColumnStatusSchema.optional(), reason: z.string().trim().min(3).max(500).optional(),
});

export const CreateClayOperationLogRequestSchema = z.object({
  displayOrder: z.coerce.number().int().min(0).max(99), startTime: TimeSchema.nullable().optional(), endTime: TimeSchema.nullable().optional(),
  category: ClayOperationCategorySchema.default('NOTE'), description: z.string().trim().min(1).max(1000),
}).refine((value) => (value.startTime == null) === (value.endTime == null), { message: 'Jam mulai dan selesai harus diisi berpasangan.' });

export const ClayHourlyBackfillRequestSchema = z.object({
  requestId: z.string().uuid(), batchId: z.string().uuid().optional(), columnId: z.string().uuid(),
  eventAt: z.string().datetime({ offset: true }), delta: z.coerce.number().int().min(-250).max(250).refine((v) => v !== 0),
  reason: z.string().trim().min(3).max(500),
});
export const ClayWorkflowActionRequestSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() });

export const ClayColumnSchema = z.object({
  id: z.string().uuid(), reportId: z.string().uuid(), displayOrder: z.number().int(), vendorId: z.string().uuid().nullable(), sourceId: z.string().uuid().nullable(), pileId: z.string().uuid().nullable(),
  vendorNameSnapshot: z.string().nullable(), sourceNameSnapshot: z.string().nullable(), headerPrimary: z.string(), headerSecondary: z.string().nullable(),
  inputMode: ClayColumnInputModeSchema, status: ClayColumnStatusSchema, tonPerRetaseSnapshot: z.number().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const ClayOperationLogSchema = z.object({
  id: z.string().uuid(), reportId: z.string().uuid(), displayOrder: z.number().int(), startTime: z.string().nullable(), endTime: z.string().nullable(),
  category: ClayOperationCategorySchema, description: z.string(), createdAt: z.string().datetime(),
});
export const ClayHourlyCellSchema = z.object({ columnId: z.string().uuid(), hour: z.string(), retase: z.number().int(), tonnage: z.number() });
export const ClayReportSchema = z.object({
  id: z.string().uuid(), operationDate: DateSchema, shiftCode: z.string(), crusherId: z.string().uuid(), crusherCode: z.string(), crusherName: z.string(),
  version: z.number().int(), status: ClayReportStatusSchema, operatorNameSnapshot: z.string().nullable(),
  productionTonnage: z.number().nullable(), runningMinutes: z.number().int().nullable(), totalRunningMinutes: z.number().int().nullable(), capacityTph: z.number().nullable(), stockPercent: z.number().nullable(),
  pickupLocation: z.string().nullable(), weather: z.string().nullable(), pileFilling: z.string().nullable(), sm: z.number().nullable(), sio2: z.number().nullable(), h2o: z.number().nullable(),
  attendancePresent: z.number().int().nullable(), attendanceSick: z.number().int().nullable(), attendanceOvertime: z.number().int().nullable(), attendancePermission: z.number().int().nullable(), attendanceLeave: z.number().int().nullable(), note: z.string().nullable(),
  createdBy: z.string().uuid(), submittedAt: z.string().datetime().nullable(), approvedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  columns: z.array(ClayColumnSchema), operationLogs: z.array(ClayOperationLogSchema), hourly: z.array(ClayHourlyCellSchema), totalRetase: z.number().int(), totalTonnage: z.number(),
});
export const ClayReportResponseSchema = z.object({ ok: z.literal(true), report: ClayReportSchema });

export type ClayReportContext = z.infer<typeof ClayReportContextSchema>;
export type PatchClayReportRequest = z.infer<typeof PatchClayReportRequestSchema>;
export type CreateClayColumnRequest = z.infer<typeof CreateClayColumnRequestSchema>;
export type UpdateClayColumnRequest = z.infer<typeof UpdateClayColumnRequestSchema>;
export type CreateClayOperationLogRequest = z.infer<typeof CreateClayOperationLogRequestSchema>;
export type ClayHourlyBackfillRequest = z.infer<typeof ClayHourlyBackfillRequestSchema>;
export type ClayReport = z.infer<typeof ClayReportSchema>;
