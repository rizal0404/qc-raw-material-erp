import { z } from 'zod';
import { IsoDateSchema } from './dates';
import { MaterialKindSchema } from './master';

export const ShiftCodeSchema = z.enum(['SHIFT_1','SHIFT_2','SHIFT_3']);
export const ShiftReportStatusSchema = z.enum(['DRAFT','SUBMITTED','SUPERSEDED','LOCKED','REVISED']);
export const AssignmentStatusSchema = z.enum(['ACTIVE','CLOSED','CANCELLED']);

const CountSchema = z.coerce.number().int().min(0).max(9999);
const NullableText = z.string().trim().max(500).nullable().optional();
const TimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm.');

export const FleetSummarySchema = z.object({
  total: CountSchema,
  operating: CountSchema,
  standby: CountSchema,
  breakdown: CountSchema,
  repair: CountSchema,
  other: CountSchema,
});

export const ShiftAssignmentInputSchema = z.object({
  id: z.string().uuid().optional(),
  amId: z.string().uuid(),
  sourceId: z.string().uuid(),
  crusherId: z.string().uuid(),
  pileId: z.string().uuid().nullable().optional(),
  blockSnapshot: z.string().trim().max(160).nullable().optional(),
  validFrom: TimeSchema.nullable().optional(),
  validTo: TimeSchema.nullable().optional(),
  aaIds: z.array(z.string().uuid()).max(100).default([]),
  note: NullableText,
}).superRefine((value, ctx) => {
  const hasFrom = !!value.validFrom;
  const hasTo = !!value.validTo;
  if (hasFrom !== hasTo) ctx.addIssue({ code: 'custom', path: ['validFrom'], message: 'Start dan End Time harus diisi berpasangan.' });
  if (value.validFrom && value.validTo && value.validFrom === value.validTo) ctx.addIssue({ code: 'custom', path: ['validTo'], message: 'End Time harus berbeda dari Start Time.' });
  if (new Set(value.aaIds).size !== value.aaIds.length) ctx.addIssue({ code: 'custom', path: ['aaIds'], message: 'AA duplikat dalam assignment yang sama.' });
});

export const ShiftReportDraftInputSchema = z.object({
  vendorId: z.string().uuid().optional(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  materialKind: MaterialKindSchema.default('LS'),
  am: FleetSummarySchema,
  aa: FleetSummarySchema,
  note: NullableText,
  assignments: z.array(ShiftAssignmentInputSchema).max(100).default([]),
});

export const ShiftReportCurrentQuerySchema = z.object({
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  vendorId: z.string().uuid().optional(),
  materialKind: MaterialKindSchema.default('LS'),
});

export const ShiftReportListQuerySchema = z.object({
  vendorId: z.string().uuid().optional(),
  operationDate: IsoDateSchema.optional(),
  shiftCode: ShiftCodeSchema.optional(),
  status: ShiftReportStatusSchema.optional(),
  materialKind: MaterialKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const CreateShiftReportRequestSchema = ShiftReportDraftInputSchema;
export const UpdateShiftReportDraftRequestSchema = ShiftReportDraftInputSchema.omit({ vendorId: true, operationDate: true, shiftCode: true, materialKind: true });
export const SubmitShiftReportRequestSchema = z.object({ reason: z.string().trim().max(500).nullable().optional() }).default({});
export const CreateShiftReportRevisionRequestSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const ShiftAssignmentSchema = z.object({
  id: z.string().uuid(),
  reportId: z.string().uuid(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  vendorId: z.string().uuid(),
  amId: z.string().uuid(),
  amUnitNo: z.string(),
  amBrand: z.string().nullable(),
  amModel: z.string().nullable(),
  sourceId: z.string().uuid(),
  sourceCode: z.string(),
  sourceName: z.string(),
  blockSnapshot: z.string().nullable(),
  materialCategory: z.string(),
  materialKind: z.enum(['LS','CL']),
  crusherId: z.string().uuid(),
  crusherCode: z.string(),
  crusherName: z.string(),
  pileId: z.string().uuid().nullable(),
  pileCode: z.string().nullable(),
  pileName: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: AssignmentStatusSchema,
  note: z.string().nullable(),
  aa: z.array(z.object({
    id: z.string().uuid(),
    assignmentAaId: z.string().uuid(),
    unitNo: z.string(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
  })),
});

export const ShiftReportSchema = z.object({
  id: z.string().uuid(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  vendorId: z.string().uuid(),
  vendorCode: z.string(),
  vendorName: z.string(),
  materialKind: MaterialKindSchema,
  version: z.number().int().min(1),
  status: ShiftReportStatusSchema,
  am: FleetSummarySchema,
  aa: FleetSummarySchema,
  note: z.string().nullable(),
  revisionReason: z.string().nullable(),
  revisesReportId: z.string().uuid().nullable(),
  submittedAt: z.string().datetime().nullable(),
  submittedBy: z.string().uuid().nullable(),
  submittedByName: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdByName: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  assignments: z.array(ShiftAssignmentSchema),
});

export const ShiftReportResponseSchema = z.object({ ok: z.literal(true), item: ShiftReportSchema.nullable() });
export const ShiftReportListResponseSchema = z.object({ ok: z.literal(true), items: z.array(ShiftReportSchema), total: z.number().int().nonnegative() });

export type ShiftCode = z.infer<typeof ShiftCodeSchema>;
export type ShiftReportStatus = z.infer<typeof ShiftReportStatusSchema>;
export type FleetSummary = z.infer<typeof FleetSummarySchema>;
export type ShiftAssignmentInput = z.infer<typeof ShiftAssignmentInputSchema>;
export type ShiftReportDraftInput = z.infer<typeof ShiftReportDraftInputSchema>;
export type CreateShiftReportRequest = z.infer<typeof CreateShiftReportRequestSchema>;
export type UpdateShiftReportDraftRequest = z.infer<typeof UpdateShiftReportDraftRequestSchema>;
export type CreateShiftReportRevisionRequest = z.infer<typeof CreateShiftReportRevisionRequestSchema>;
export type ShiftAssignment = z.infer<typeof ShiftAssignmentSchema>;
export type ShiftReport = z.infer<typeof ShiftReportSchema>;
