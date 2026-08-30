import { z } from 'zod';
import { IsoDateSchema } from './dates';
import { MaterialKindSchema } from './master';
import { ChemistrySchema, QualitySchema } from './qc';
import { ShiftCodeSchema } from './vendor-operation';
import { AssignmentOriginSchema } from './retase';

export const MappingStatusSchema = z.enum(['UNMAPPED','SUGGESTED','RESERVED','AMBIGUOUS','CONFIRMED','CONSUMED','REVIEW_REQUIRED']);

export const ReconciliationListQuerySchema = z.object({
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema.optional(),
  crusherId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  materialKind: MaterialKindSchema.optional(),
  mappingStatus: MappingStatusSchema.optional(),
  search: z.string().trim().max(160).optional(),
});

export const ReconciliationCandidateSchema = z.object({
  id: z.string().uuid(),
  sampleId: z.string(),
  materialKind: MaterialKindSchema,
  operationDate: IsoDateSchema,
  vendorId: z.string().uuid().nullable(),
  vendorSnapshot: z.string().nullable(),
  sourceId: z.string().uuid().nullable(),
  sourceSnapshot: z.string().nullable(),
  block: z.string().nullable(),
  typeGrade: z.string().nullable(),
  chemistry: ChemistrySchema,
  quality: QualitySchema,
  matchMode: z.enum(['AM_ID','VENDOR_ID','VENDOR_TEXT']),
});

export const ReconciliationAllocationSchema = z.object({
  id: z.string().uuid(),
  assignmentId: z.string().uuid(),
  sampleId: z.string().uuid().nullable(),
  sampleCode: z.string().nullable(),
  mappingStatus: MappingStatusSchema,
  observedRetase: z.number().int().nonnegative(),
  approvedRetase: z.number().int().positive().nullable(),
  consumedRetase: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  note: z.string().nullable(),
  overrideReason: z.string().nullable(),
  reviewRequired: z.boolean(),
  reviewReason: z.string().nullable(),
  confirmedBy: z.string().uuid().nullable(),
  confirmedByName: z.string().nullable(),
  confirmedAt: z.string().datetime().nullable(),
  consumedMixId: z.string().uuid().nullable(),
  consumedMixCode: z.string().nullable(),
  consumedAt: z.string().datetime().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ReconciliationAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  assignmentOrigin: AssignmentOriginSchema,
  reportId: z.string().uuid().nullable(),
  reportVersion: z.number().int().positive().nullable(),
  reportStatus: z.string(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  crusherId: z.string().uuid().nullable(),
  crusherCode: z.string(),
  crusherName: z.string(),
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
  assignedAaCount: z.number().int().nonnegative(),
  assignedAaUnitNos: z.array(z.string()).optional(),
  aaWithDumpCount: z.number().int().nonnegative(),
  observedRetase: z.number().int().nonnegative(),
  reservedRetase: z.number().int().nonnegative(),
  consumedRetase: z.number().int().nonnegative(),
  remainingRetase: z.number().int(),
  candidateCount: z.number().int().nonnegative(),
  suggestedSampleId: z.string().uuid().nullable(),
  suggestedSampleCode: z.string().nullable(),
  mappingStatus: MappingStatusSchema,
  reviewRequired: z.boolean(),
  exception: z.string().nullable(),
  allocations: z.array(ReconciliationAllocationSchema),
});

export const ReconciliationExceptionSchema = z.object({
  eventId: z.string().uuid(),
  eventTs: z.string().datetime(),
  operationDate: IsoDateSchema,
  shiftCode: ShiftCodeSchema,
  crusherId: z.string().uuid(),
  crusherName: z.string(),
  vendorId: z.string().uuid().nullable(),
  vendorName: z.string().nullable(),
  aaId: z.string().uuid().nullable(),
  aaUnitNo: z.string().nullable(),
  status: z.enum(['EXCEPTION_UNASSIGNED','AMBIGUOUS']),
  reason: z.string().nullable(),
});

export const CreateRetaseAllocationRequestSchema = z.object({
  assignmentId: z.string().uuid(),
  sampleId: z.string().uuid(),
  approvedRetase: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const UpdateRetaseAllocationRequestSchema = z.object({
  sampleId: z.string().uuid().optional(),
  approvedRetase: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
}).refine((x)=>Object.keys(x).length>0,{message:'Tidak ada field yang diubah.'});

export const ConfirmRetaseAllocationRequestSchema = z.object({
  approvedRetase: z.number().int().positive().optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
});

export const ReopenRetaseAllocationRequestSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export const WorkbenchRetaseSuggestionQuerySchema = z.object({
  materialKind: MaterialKindSchema,
  operationDate: IsoDateSchema,
});

export const WorkbenchRetaseSuggestionSchema = z.object({
  sampleId: z.string().uuid(),
  sampleCode: z.string(),
  mappedRetase: z.number().int().positive(),
  allocationIds: z.array(z.string().uuid()).min(1),
  allocationCount: z.number().int().positive(),
  sources: z.array(z.object({
    allocationId: z.string().uuid(),
    assignmentId: z.string().uuid(),
    approvedRetase: z.number().int().positive(),
    vendorName: z.string(),
    crusherName: z.string(),
    amUnitNo: z.string(),
    sourceName: z.string().nullable(),
    blockSnapshot: z.string().nullable(),
  })),
});


export const ReconciliationExceptionAssignmentCandidateSchema = z.object({
  assignmentId: z.string().uuid(),
  assignmentOrigin: AssignmentOriginSchema,
  reportId: z.string().uuid().nullable(),
  reportVersion: z.number().int().positive().nullable(),
  vendorId: z.string().uuid(),
  vendorName: z.string(),
  amId: z.string().uuid(),
  amUnitNo: z.string(),
  sourceId: z.string().uuid().nullable(),
  sourceName: z.string().nullable(),
  blockSnapshot: z.string().nullable(),
  materialKind: MaterialKindSchema,
  materialCategory: z.string(),
  crusherId: z.string().uuid(),
  crusherName: z.string(),
  aaListed: z.boolean(),
});

export const ResolveReconciliationExceptionRequestSchema = z.object({
  assignmentId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

export type ReconciliationExceptionAssignmentCandidate = z.infer<typeof ReconciliationExceptionAssignmentCandidateSchema>;
export type ResolveReconciliationExceptionRequest = z.infer<typeof ResolveReconciliationExceptionRequestSchema>;

export type MappingStatus = z.infer<typeof MappingStatusSchema>;
export type ReconciliationListQuery = z.infer<typeof ReconciliationListQuerySchema>;
export type ReconciliationCandidate = z.infer<typeof ReconciliationCandidateSchema>;
export type ReconciliationAllocation = z.infer<typeof ReconciliationAllocationSchema>;
export type ReconciliationAssignment = z.infer<typeof ReconciliationAssignmentSchema>;
export type ReconciliationException = z.infer<typeof ReconciliationExceptionSchema>;
export type CreateRetaseAllocationRequest = z.infer<typeof CreateRetaseAllocationRequestSchema>;
export type UpdateRetaseAllocationRequest = z.infer<typeof UpdateRetaseAllocationRequestSchema>;
export type ConfirmRetaseAllocationRequest = z.infer<typeof ConfirmRetaseAllocationRequestSchema>;
export type WorkbenchRetaseSuggestion = z.infer<typeof WorkbenchRetaseSuggestionSchema>;
