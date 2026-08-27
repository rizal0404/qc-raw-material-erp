import { z } from 'zod';
import { IsoDateSchema } from './dates';
import { MaterialKindSchema } from './master';
import { AssignmentStatusSchema, ShiftCodeSchema } from './vendor-operation';

export const RetaseEventTypeSchema = z.enum(['DUMP','REVERSAL','MANUAL_CORRECTION']);
export const RetaseEventStatusSchema = z.enum(['VALID','EXCEPTION_UNASSIGNED','AMBIGUOUS','REVERSED']);
export const AssignmentOriginSchema = z.enum(['SHIFT_REPORT','OPERATIONAL']);

export const CounterContextLookupSchema = z.object({
  crusherId: z.string().uuid(),
  operationDate: IsoDateSchema.optional(),
  shiftCode: ShiftCodeSchema.optional(),
});

export const CounterContextQuerySchema = z.object({
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  crusherId: z.string().uuid(),
});

export const CounterBootstrapQuerySchema = z.object({
  now: z.string().datetime().optional(),
});

export const CounterAaSchema = z.object({
  assignmentAaId: z.string().uuid(),
  aaId: z.string().uuid(),
  unitNo: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  confirmedCount: z.number().int(),
  lastEventAt: z.string().datetime().nullable(),
});

export const CounterAssignmentSchema = z.object({
  id: z.string().uuid(),
  assignmentOrigin: AssignmentOriginSchema,
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  reportId: z.string().uuid().nullable(),
  reportVersion: z.number().int().positive().nullable(),
  vendorId: z.string().uuid(),
  vendorCode: z.string(),
  vendorName: z.string(),
  amId: z.string().uuid(),
  amUnitNo: z.string(),
  sourceId: z.string().uuid().nullable(),
  sourceCode: z.string().nullable(),
  sourceName: z.string().nullable(),
  blockSnapshot: z.string().nullable(),
  materialKind: MaterialKindSchema,
  materialCategory: z.string(),
  crusherId: z.string().uuid(),
  crusherCode: z.string(),
  crusherName: z.string(),
  plantId: z.string().uuid().nullable(),
  plantCode: z.string().nullable(),
  plantName: z.string().nullable(),
  pileId: z.string().uuid().nullable(),
  pileCode: z.string().nullable(),
  pileName: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: AssignmentStatusSchema,
  note: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdByName: z.string().nullable(),
  updatedAt: z.string().datetime(),
  activeNow: z.boolean(),
  aa: z.array(CounterAaSchema),
});

const OperationalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:mm.');
const OperationalAssignmentBaseSchema = z.object({
  vendorId: z.string().uuid().optional(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  amId: z.string().uuid(),
  sourceId: z.string().uuid().nullable().optional(),
  crusherId: z.string().uuid(),
  pileId: z.string().uuid().nullable().optional(),
  blockSnapshot: z.string().trim().max(160).nullable().optional(),
  materialCategory: z.string().trim().min(1).max(64).optional(),
  validFrom: OperationalTimeSchema.nullable().optional(),
  validTo: OperationalTimeSchema.nullable().optional(),
  aaIds: z.array(z.string().uuid()).min(1).max(100),
  note: z.string().trim().max(500).nullable().optional(),
});
export const OperationalAssignmentInputSchema = OperationalAssignmentBaseSchema.superRefine((value,ctx)=>{
  if(Boolean(value.validFrom)!==Boolean(value.validTo))ctx.addIssue({code:'custom',path:['validFrom'],message:'Start dan End Time harus diisi berpasangan.'});
  if(value.validFrom&&value.validTo&&value.validFrom===value.validTo)ctx.addIssue({code:'custom',path:['validTo'],message:'End Time harus berbeda dari Start Time.'});
  if(new Set(value.aaIds).size!==value.aaIds.length)ctx.addIssue({code:'custom',path:['aaIds'],message:'AA duplikat dalam assignment.'});
});
export const OperationalAssignmentListQuerySchema = z.object({
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  vendorId: z.string().uuid().optional(),
  crusherId: z.string().uuid().optional(),
  status: AssignmentStatusSchema.optional(),
});
export const UpdateOperationalAssignmentRequestSchema = OperationalAssignmentBaseSchema.omit({vendorId:true,operationDate:true,shiftCode:true}).superRefine((value,ctx)=>{
  if(Boolean(value.validFrom)!==Boolean(value.validTo))ctx.addIssue({code:'custom',path:['validFrom'],message:'Start dan End Time harus diisi berpasangan.'});
  if(value.validFrom&&value.validTo&&value.validFrom===value.validTo)ctx.addIssue({code:'custom',path:['validTo'],message:'End Time harus berbeda dari Start Time.'});
  if(new Set(value.aaIds).size!==value.aaIds.length)ctx.addIssue({code:'custom',path:['aaIds'],message:'AA duplikat dalam assignment.'});
});
export const CancelOperationalAssignmentRequestSchema = z.object({reason:z.string().trim().min(3).max(500)});
export const OperationalAssignmentResponseSchema = z.object({ok:z.literal(true),item:CounterAssignmentSchema});
export const OperationalAssignmentListResponseSchema = z.object({ok:z.literal(true),items:z.array(CounterAssignmentSchema),total:z.number().int().nonnegative()});

export const CounterBusinessContextSchema = z.object({
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  localDate: IsoDateSchema,
  localTime: z.string(),
});

export const CounterContextResponseSchema = z.object({
  ok: z.literal(true),
  timezone: z.string(),
  current: CounterBusinessContextSchema,
  requested: CounterContextQuerySchema,
  canRecord: z.boolean(),
  crusher: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    materialKind: MaterialKindSchema,
  }),
  submittedReportCount: z.number().int().nonnegative(),
  operationalAssignmentCount: z.number().int().nonnegative(),
  assignmentCount: z.number().int().nonnegative(),
});

export const CounterAssignmentsResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(CounterAssignmentSchema),
  total: z.number().int().nonnegative(),
});

export const RecordRetaseEventRequestSchema = z.object({
  requestId: z.string().uuid(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  crusherId: z.string().uuid(),
  clayReportColumnId: z.string().uuid().optional(),
  assignmentAaId: z.string().uuid().optional(),
  aaId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  unlistedUnitNo: z.string().trim().min(1).max(64).optional(),
  reason: z.string().trim().min(3).max(500).optional(),
  clientTs: z.string().datetime().optional(),
}).superRefine((value, ctx) => {
  if (!value.assignmentAaId && !value.clayReportColumnId) {
    if (!value.aaId && !value.unlistedUnitNo) {
      ctx.addIssue({ code: 'custom', path: ['unlistedUnitNo'], message: 'AA atau nomor unit wajib untuk Unlisted AA.' });
    }
    if (!value.reason) {
      ctx.addIssue({ code: 'custom', path: ['reason'], message: 'Reason wajib untuk Unlisted AA.' });
    }
  }
});

export const ReverseRetaseEventRequestSchema = z.object({
  requestId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});

export const RetaseEventSchema = z.object({
  id: z.string().uuid(),
  requestId: z.string().uuid(),
  operationDate: IsoDateSchema,
  eventTs: z.string().datetime(),
  shiftCode: ShiftCodeSchema,
  crusherId: z.string().uuid(),
  crusherCode: z.string(),
  crusherName: z.string(),
  vendorId: z.string().uuid().nullable(),
  vendorName: z.string().nullable(),
  reportId: z.string().uuid().nullable(),
  reportVersion: z.number().int().nullable(),
  assignmentId: z.string().uuid().nullable(),
  assignmentAaId: z.string().uuid().nullable(),
  assignmentOrigin: AssignmentOriginSchema.nullable(),
  clayReportId: z.string().uuid().nullable(),
  clayReportColumnId: z.string().uuid().nullable(),
  entrySource: z.enum(['LIVE_COUNTER','QC_BACKFILL','IMPORT']),
  entryBatchId: z.string().uuid().nullable(),
  amId: z.string().uuid().nullable(),
  amUnitNo: z.string().nullable(),
  aaId: z.string().uuid().nullable(),
  aaUnitNo: z.string().nullable(),
  sourceId: z.string().uuid().nullable(),
  sourceCode: z.string().nullable(),
  sourceName: z.string().nullable(),
  pileId: z.string().uuid().nullable(),
  pileCode: z.string().nullable(),
  pileName: z.string().nullable(),
  blockSnapshot: z.string().nullable(),
  materialKind: MaterialKindSchema.nullable(),
  materialCategory: z.string().nullable(),
  delta: z.union([z.literal(1), z.literal(-1)]),
  eventType: RetaseEventTypeSchema,
  status: RetaseEventStatusSchema,
  createdBy: z.string().uuid(),
  createdByName: z.string(),
  reversesEventId: z.string().uuid().nullable(),
  reason: z.string().nullable(),
  clientTs: z.string().datetime().nullable(),
  canReverse: z.boolean().default(false),
});

export const RetaseEventResponseSchema = z.object({ ok: z.literal(true), item: RetaseEventSchema, idempotent: z.boolean().optional() });

export const RetaseEventListQuerySchema = CounterContextQuerySchema.extend({
  vendorId: z.string().uuid().optional(),
  aaId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const RetaseEventListResponseSchema = z.object({
  ok: z.literal(true),
  items: z.array(RetaseEventSchema),
  total: z.number().int().nonnegative(),
});

export const RetaseSummaryQuerySchema = CounterContextQuerySchema;

const RetaseBucketSchema = z.object({ id: z.string().nullable(), label: z.string(), retase: z.number().int() });

export const RetaseSummarySchema = z.object({
  totalNet: z.number().int(),
  dumpEvents: z.number().int().nonnegative(),
  reversalEvents: z.number().int().nonnegative(),
  unassignedEvents: z.number().int().nonnegative(),
  ambiguousEvents: z.number().int().nonnegative(),
  byVendor: z.array(RetaseBucketSchema),
  byAm: z.array(RetaseBucketSchema),
  byAa: z.array(RetaseBucketSchema),
  hourly: z.array(z.object({ hour: z.string(), retase: z.number().int() })),
});

export const RetaseSummaryResponseSchema = z.object({ ok: z.literal(true), summary: RetaseSummarySchema });

export type CounterContextLookup = z.infer<typeof CounterContextLookupSchema>;
export type CounterContextQuery = z.infer<typeof CounterContextQuerySchema>;
export type CounterAssignment = z.infer<typeof CounterAssignmentSchema>;
export type AssignmentOrigin = z.infer<typeof AssignmentOriginSchema>;
export type OperationalAssignmentInput = z.infer<typeof OperationalAssignmentInputSchema>;
export type OperationalAssignmentListQuery = z.infer<typeof OperationalAssignmentListQuerySchema>;
export type UpdateOperationalAssignmentRequest = z.infer<typeof UpdateOperationalAssignmentRequestSchema>;
export type CounterContextResponse = z.infer<typeof CounterContextResponseSchema>;
export type RecordRetaseEventRequest = z.infer<typeof RecordRetaseEventRequestSchema>;
export type ReverseRetaseEventRequest = z.infer<typeof ReverseRetaseEventRequestSchema>;
export type RetaseEvent = z.infer<typeof RetaseEventSchema>;
export type RetaseSummary = z.infer<typeof RetaseSummarySchema>;
