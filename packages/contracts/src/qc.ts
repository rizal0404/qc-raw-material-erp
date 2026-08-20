import { z } from 'zod';
import { IsoDateSchema } from './dates';
import { MaterialKindSchema } from './master';

export const ChemistryKeySchema = z.enum(['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o']);
const OxideSchema = z.number().finite().min(0).max(100).nullable();

export const ChemistrySchema = z.object({
  sio2: OxideSchema, al2o3: OxideSchema, fe2o3: OxideSchema, cao: OxideSchema, mgo: OxideSchema,
  k2o: OxideSchema, na2o: OxideSchema, so3: OxideSchema, h2o: OxideSchema,
});
export const QualitySchema = z.object({
  lsf: z.number().finite().nullable(), sm: z.number().finite().nullable(), am: z.number().finite().nullable(),
  naeq: z.number().finite().nullable(), r2o3: z.number().finite().nullable(),
});

export const RawSampleSchema = z.object({
  id: z.string().uuid(), sampleId: z.string(), materialKind: MaterialKindSchema, operationDate: IsoDateSchema,
  noSample: z.string().nullable(), sourceShift: z.string().nullable(), typeGrade: z.string().nullable(),
  vendorId: z.string().uuid().nullable(), vendorSnapshot: z.string().nullable(), sourceId: z.string().uuid().nullable(), sourceSnapshot: z.string().nullable(),
  plantId: z.string().uuid().nullable(), loaderUnitNo: z.string().nullable(), block: z.string().nullable(), direction: z.string().nullable(),
  chemistry: ChemistrySchema, quality: QualitySchema, note: z.string().nullable(),
  createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});

export const RawSampleListQuerySchema = z.object({
  materialKind: MaterialKindSchema.optional(), operationDate: IsoDateSchema.optional(), vendorId: z.string().uuid().optional(), sourceId: z.string().uuid().optional(),
  search: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(500).default(200), offset: z.coerce.number().int().min(0).default(0),
});

const SampleBaseInput = z.object({
  sampleId: z.string().trim().min(1).max(120), materialKind: MaterialKindSchema, operationDate: IsoDateSchema,
  noSample: z.string().trim().max(120).nullable().optional(), sourceShift: z.string().trim().max(120).nullable().optional(), typeGrade: z.string().trim().max(120).nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(), vendorSnapshot: z.string().trim().max(200).nullable().optional(),
  sourceId: z.string().uuid().nullable().optional(), sourceSnapshot: z.string().trim().max(200).nullable().optional(), plantId: z.string().uuid().nullable().optional(),
  loaderUnitNo: z.string().trim().max(120).nullable().optional(), block: z.string().trim().max(120).nullable().optional(), direction: z.string().trim().max(120).nullable().optional(),
  chemistry: ChemistrySchema, note: z.string().trim().max(1000).nullable().optional(),
});
export const CreateRawSampleRequestSchema = SampleBaseInput;
export const UpdateRawSampleRequestSchema = SampleBaseInput.partial().extend({ reason: z.string().trim().min(3).max(500) })
  .refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });
export const ImportRawSamplesRequestSchema = z.object({
  mode: z.enum(['INSERT_ONLY','UPSERT']).default('INSERT_ONLY'),
  rows: z.array(SampleBaseInput).min(1).max(5000),
  reason: z.string().trim().min(3).max(500).default('Legacy/raw sample import'),
});

export const WorkbenchSamplesQuerySchema = z.object({
  materialKind: MaterialKindSchema, operationDate: IsoDateSchema,
});

export const MixItemInputSchema = z.object({
  rawSampleId: z.string().uuid(), retase: z.number().int().positive(), tonPerRetase: z.number().finite().positive(),
  note: z.string().trim().max(1000).nullable().optional(), chemistry: ChemistrySchema.optional(), oxideChangeNote: z.string().trim().min(3).max(1000).nullable().optional(),
  retaseAllocationIds: z.array(z.string().uuid()).max(100).default([]),
  retaseOverrideReason: z.string().trim().min(3).max(1000).nullable().optional(),
});
export const SaveMixRequestSchema = z.object({
  materialKind: MaterialKindSchema, operationDate: IsoDateSchema, pileId: z.string().uuid(), shiftCode: z.enum(['SHIFT_1','SHIFT_2','SHIFT_3']),
  batchNo: z.number().int().positive().nullable().optional(), tiangKe: z.string().trim().min(1).max(120).nullable().optional(), pileCycle: z.number().int().positive(),
  defaultTonPerRetase: z.number().finite().positive(), note: z.string().trim().max(2000).nullable().optional(), items: z.array(MixItemInputSchema).min(1).max(500),
}).superRefine((value, ctx) => {
  if (value.materialKind === 'LS' && !value.batchNo) ctx.addIssue({ code: 'custom', path: ['batchNo'], message: 'Batch_No wajib untuk Limestone.' });
  if (value.materialKind === 'CL' && !value.tiangKe) ctx.addIssue({ code: 'custom', path: ['tiangKe'], message: 'Tiang_ke wajib untuk Clay.' });
});
export const ReplaceMixRequestSchema = SaveMixRequestSchema.and(z.object({ reason: z.string().trim().min(3).max(1000) }));
export const ChemistryRevisionRequestSchema = z.object({ chemistry: ChemistrySchema, reason: z.string().trim().min(3).max(1000) });

export const MixListQuerySchema = z.object({
  materialKind: MaterialKindSchema.optional(), operationDate: IsoDateSchema.optional(), pileId: z.string().uuid().optional(), status: z.enum(['ACTIVE','REPLACED','VOID']).optional(),
  search: z.string().trim().max(160).optional(), limit: z.coerce.number().int().min(1).max(500).default(200), offset: z.coerce.number().int().min(0).default(0),
});

export const MixSummaryQuerySchema = z.object({
  materialKind: MaterialKindSchema.optional(), dateFrom: IsoDateSchema.optional(), dateTo: IsoDateSchema.optional(), plantId: z.string().uuid().optional(), pileId: z.string().uuid().optional(),
});
export const PileCumulativeQuerySchema = z.object({
  materialKind: MaterialKindSchema, cutoffDate: IsoDateSchema.optional(), plantId: z.string().uuid().optional(), className: z.string().trim().max(120).optional(),
});
export const QafQuerySchema = z.object({
  materialKind: MaterialKindSchema, month: z.string().regex(/^\d{4}-\d{2}$/), plantId: z.string().uuid(),
});

export type Chemistry = z.infer<typeof ChemistrySchema>;
export type Quality = z.infer<typeof QualitySchema>;
export type RawSample = z.infer<typeof RawSampleSchema>;
export type CreateRawSampleRequest = z.infer<typeof CreateRawSampleRequestSchema>;
export type UpdateRawSampleRequest = z.infer<typeof UpdateRawSampleRequestSchema>;
export type ImportRawSamplesRequest = z.infer<typeof ImportRawSamplesRequestSchema>;
export type SaveMixRequest = z.infer<typeof SaveMixRequestSchema>;
export type ReplaceMixRequest = z.infer<typeof ReplaceMixRequestSchema>;
