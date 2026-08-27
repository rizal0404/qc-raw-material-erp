import { z } from 'zod';

export const MaterialKindSchema = z.enum(['LS', 'CL']);
export const EquipmentTypeSchema = z.enum(['AM', 'AA']);
export const ActiveQuerySchema = z.enum(['true', 'false', 'all']).default('all');

export const MasterListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  active: ActiveQuerySchema.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const VendorListQuerySchema = MasterListQuerySchema.extend({
  materialKind: MaterialKindSchema.optional(),
});
export const EquipmentListQuerySchema = MasterListQuerySchema.extend({
  vendorId: z.string().uuid().optional(),
  type: EquipmentTypeSchema.optional(),
  materialKind: MaterialKindSchema.optional(),
});
export const CrusherListQuerySchema = MasterListQuerySchema.extend({
  materialKind: MaterialKindSchema.optional(),
  plantId: z.string().uuid().optional(),
});
export const SourceListQuerySchema = MasterListQuerySchema.extend({
  materialKind: MaterialKindSchema.optional(),
  materialCategory: z.string().trim().max(64).optional(),
});
export const PileListQuerySchema = MasterListQuerySchema.extend({
  materialKind: MaterialKindSchema.optional(),
  plantId: z.string().uuid().optional(),
});
export const PlantListQuerySchema = MasterListQuerySchema.extend({
  materialKind: MaterialKindSchema.optional(),
});

const AuditReasonSchema = z.string().trim().min(3).max(500).optional();
const CodeSchema = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9._ -]+$/);
const NameSchema = z.string().trim().min(2).max(160);
const AliasArraySchema = z.array(z.string().trim().min(1).max(120)).max(50).default([]);
const MaterialKindsSchema = z.array(MaterialKindSchema).min(1).max(2)
  .transform((values) => [...new Set(values)]);

export const VendorSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  aliases: z.array(z.string()),
  materialKinds: z.array(MaterialKindSchema),
  contactEmail: z.string().email().nullable(),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreateVendorRequestSchema = z.object({
  code: CodeSchema,
  name: NameSchema,
  aliases: AliasArraySchema,
  materialKinds: MaterialKindsSchema.default(['LS', 'CL']),
  contactEmail: z.string().trim().email().nullable().optional(),
});
export const UpdateVendorRequestSchema = z.object({
  code: CodeSchema.optional(),
  name: NameSchema.optional(),
  aliases: AliasArraySchema.optional(),
  materialKinds: MaterialKindsSchema.optional(),
  contactEmail: z.string().trim().email().nullable().optional(),
  active: z.boolean().optional(),
  reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const PlantSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  materialKinds: z.array(MaterialKindSchema),
  active: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export const CreatePlantRequestSchema = z.object({
  code: CodeSchema, name: NameSchema, materialKinds: MaterialKindsSchema.default(['LS', 'CL']),
});
export const UpdatePlantRequestSchema = z.object({
  code: CodeSchema.optional(), name: NameSchema.optional(), materialKinds: MaterialKindsSchema.optional(),
  active: z.boolean().optional(), reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const CrusherSchema = z.object({
  id: z.string().uuid(), code: z.string(), name: z.string(), materialKind: MaterialKindSchema,
  plantId: z.string().uuid().nullable(), plantCode: z.string().nullable(), plantName: z.string().nullable(),
  active: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const CreateCrusherRequestSchema = z.object({
  code: CodeSchema, name: NameSchema, materialKind: MaterialKindSchema, plantId: z.string().uuid().nullable().optional(),
});
export const UpdateCrusherRequestSchema = z.object({
  code: CodeSchema.optional(), name: NameSchema.optional(), materialKind: MaterialKindSchema.optional(),
  plantId: z.string().uuid().nullable().optional(), active: z.boolean().optional(), reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const EquipmentSchema = z.object({
  id: z.string().uuid(), vendorId: z.string().uuid(), vendorCode: z.string(), vendorName: z.string(),
  type: EquipmentTypeSchema, unitNo: z.string(), brand: z.string().nullable(), model: z.string().nullable(),
  aliases: z.array(z.string()), materialKinds: z.array(MaterialKindSchema),
  active: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const CreateEquipmentRequestSchema = z.object({
  vendorId: z.string().uuid(), type: EquipmentTypeSchema, unitNo: z.string().trim().min(1).max(64),
  brand: z.string().trim().max(120).nullable().optional(), model: z.string().trim().max(120).nullable().optional(),
  aliases: AliasArraySchema, materialKinds: MaterialKindsSchema.default(['LS', 'CL']),
});
export const UpdateEquipmentRequestSchema = z.object({
  vendorId: z.string().uuid().optional(), type: EquipmentTypeSchema.optional(), unitNo: z.string().trim().min(1).max(64).optional(),
  brand: z.string().trim().max(120).nullable().optional(), model: z.string().trim().max(120).nullable().optional(), aliases: AliasArraySchema.optional(),
  materialKinds: MaterialKindsSchema.optional(), active: z.boolean().optional(), reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const SourceSchema = z.object({
  id: z.string().uuid(), code: z.string(), name: z.string(), block: z.string().nullable(),
  materialCategory: z.string(), materialKind: MaterialKindSchema, aliases: z.array(z.string()),
  active: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const CreateSourceRequestSchema = z.object({
  code: CodeSchema, name: NameSchema, block: z.string().trim().max(120).nullable().optional(),
  materialCategory: z.string().trim().min(1).max(64), materialKind: MaterialKindSchema, aliases: AliasArraySchema,
});
export const UpdateSourceRequestSchema = z.object({
  code: CodeSchema.optional(), name: NameSchema.optional(), block: z.string().trim().max(120).nullable().optional(),
  materialCategory: z.string().trim().min(1).max(64).optional(), materialKind: MaterialKindSchema.optional(), aliases: AliasArraySchema.optional(),
  active: z.boolean().optional(), reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const PileSchema = z.object({
  id: z.string().uuid(), code: z.string(), name: z.string(), materialKind: MaterialKindSchema,
  plantId: z.string().uuid().nullable(), plantCode: z.string().nullable(), plantName: z.string().nullable(),
  className: z.string().nullable(), active: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
});
export const CreatePileRequestSchema = z.object({
  code: CodeSchema, name: NameSchema, materialKind: MaterialKindSchema, plantId: z.string().uuid().nullable().optional(),
  className: z.string().trim().max(120).nullable().optional(),
});
export const UpdatePileRequestSchema = z.object({
  code: CodeSchema.optional(), name: NameSchema.optional(), materialKind: MaterialKindSchema.optional(),
  plantId: z.string().uuid().nullable().optional(), className: z.string().trim().max(120).nullable().optional(),
  active: z.boolean().optional(), reason: AuditReasonSchema,
}).refine((value) => Object.keys(value).some((key) => key !== 'reason'), { message: 'Tidak ada field yang diubah.' });

export const ShiftSchema = z.object({
  code: z.string(), name: z.string(), startTime: z.string(), endTime: z.string(), crossesMidnight: z.boolean(), active: z.boolean(),
});

export const MasterListResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({
  ok: z.literal(true), items: z.array(itemSchema), total: z.number().int().nonnegative(),
});
export const MasterMutationResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) => z.object({ ok: z.literal(true), item: itemSchema });

export const LookupOptionSchema = z.object({ id: z.string(), code: z.string(), label: z.string(), active: z.boolean() });
export const ScopedLookupOptionSchema = LookupOptionSchema.extend({ materialKinds: z.array(MaterialKindSchema) });
export const EquipmentLookupOptionSchema = ScopedLookupOptionSchema.extend({ vendorId: z.string().uuid(), type: EquipmentTypeSchema, unitNo: z.string() });
export const CrusherLookupOptionSchema = LookupOptionSchema.extend({ materialKind: MaterialKindSchema, plantId: z.string().uuid().nullable() });
export const SourceLookupOptionSchema = LookupOptionSchema.extend({ materialKind: MaterialKindSchema, materialCategory: z.string(), block: z.string().nullable() });
export const PileLookupOptionSchema = LookupOptionSchema.extend({ materialKind: MaterialKindSchema, plantId: z.string().uuid().nullable(), className: z.string().nullable() });
export const ShiftLookupOptionSchema = z.object({ code: z.string(), label: z.string(), startTime: z.string(), endTime: z.string(), crossesMidnight: z.boolean() });

export const MasterLookupResponseSchema = z.object({
  ok: z.literal(true),
  vendors: z.array(ScopedLookupOptionSchema),
  plants: z.array(ScopedLookupOptionSchema),
  crushers: z.array(CrusherLookupOptionSchema),
  sources: z.array(SourceLookupOptionSchema),
  piles: z.array(PileLookupOptionSchema),
  shifts: z.array(ShiftLookupOptionSchema),
  materialCategories: z.array(z.string()),
});
export const EquipmentLookupResponseSchema = z.object({ ok: z.literal(true), items: z.array(EquipmentLookupOptionSchema) });

export type MaterialKind = z.infer<typeof MaterialKindSchema>;
export type EquipmentType = z.infer<typeof EquipmentTypeSchema>;
export type Vendor = z.infer<typeof VendorSchema>;
export type Plant = z.infer<typeof PlantSchema>;
export type Crusher = z.infer<typeof CrusherSchema>;
export type Equipment = z.infer<typeof EquipmentSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Pile = z.infer<typeof PileSchema>;
export type Shift = z.infer<typeof ShiftSchema>;
export type CreateVendorRequest = z.infer<typeof CreateVendorRequestSchema>;
export type UpdateVendorRequest = z.infer<typeof UpdateVendorRequestSchema>;
export type CreatePlantRequest = z.infer<typeof CreatePlantRequestSchema>;
export type UpdatePlantRequest = z.infer<typeof UpdatePlantRequestSchema>;
export type CreateCrusherRequest = z.infer<typeof CreateCrusherRequestSchema>;
export type UpdateCrusherRequest = z.infer<typeof UpdateCrusherRequestSchema>;
export type CreateEquipmentRequest = z.infer<typeof CreateEquipmentRequestSchema>;
export type UpdateEquipmentRequest = z.infer<typeof UpdateEquipmentRequestSchema>;
export type CreateSourceRequest = z.infer<typeof CreateSourceRequestSchema>;
export type UpdateSourceRequest = z.infer<typeof UpdateSourceRequestSchema>;
export type CreatePileRequest = z.infer<typeof CreatePileRequestSchema>;
export type UpdatePileRequest = z.infer<typeof UpdatePileRequestSchema>;
export type MasterLookupResponse = z.infer<typeof MasterLookupResponseSchema>;
export type EquipmentLookupResponse = z.infer<typeof EquipmentLookupResponseSchema>;
