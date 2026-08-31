import { z } from 'zod';
import { MaterialKindSchema } from './master';
import { ChemistrySchema, QualitySchema } from './qc';

export const StockpileLotStatusSchema = z.enum(['ACTIVE', 'RECLAIMED']);
export const StockpileLotStatusFilterSchema = z.enum(['ACTIVE', 'RECLAIMED', 'ALL']);
export const StockpileLotNoModeSchema = z.enum(['PILE_CYCLE', 'MANUAL']);
export const WarehouseZoneKindSchema = z.enum(['FILLER', 'HOPPER', 'LOADER_FEED', 'DIVIDER', 'TRACK', 'LABEL']);
export const StockpileQualityStatusSchema = z.enum(['OK', 'CHECK', 'NO_DATA']);

const CoordinateSchema = z.coerce.number().finite().min(0).max(1000);
const LevelSchema = z.coerce.number().finite().min(0).max(100);
const LotNoSchema = z.string().trim().min(1).max(64);

export const WarehousePostMarkSchema = z.object({
  position: CoordinateSchema,
  label: z.string().trim().min(1).max(16),
});

export const WarehouseLayoutSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  materialKind: MaterialKindSchema,
  plantId: z.string().uuid(),
  plantCode: z.string(),
  plantName: z.string(),
  axisLength: z.number().positive(),
  maxLevel: z.number().positive(),
  postMarks: z.array(WarehousePostMarkSchema),
  hopperSide: z.enum(['START', 'END']),
  active: z.boolean(),
});

export const WarehouseZoneSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  kind: WarehouseZoneKindSchema,
  startPosition: z.number(),
  endPosition: z.number(),
  bottomLevel: z.number(),
  topLevel: z.number(),
  displayOrder: z.number().int(),
});

export const StockpileMixSummarySchema = z.object({
  mixId: z.string().uuid(),
  mixCode: z.string(),
  materialKind: MaterialKindSchema,
  operationDate: z.string(),
  pileId: z.string().uuid(),
  pileCode: z.string(),
  pileName: z.string(),
  className: z.string().nullable(),
  pileCycle: z.number().int().positive(),
  batchNo: z.number().int().positive().nullable(),
  tiangKe: z.string().nullable(),
  totalTon: z.number().nonnegative(),
  chemistry: ChemistrySchema,
  quality: QualitySchema,
});

export const StockpileLotSchema = z.object({
  id: z.string().uuid(),
  layoutId: z.string().uuid(),
  logicalPileId: z.string().uuid(),
  logicalPileCode: z.string(),
  logicalPileName: z.string(),
  className: z.string().nullable(),
  lotNo: z.string(),
  lotNoMode: StockpileLotNoModeSchema,
  pileCycle: z.number().int().positive(),
  status: StockpileLotStatusSchema,
  reclaimedAt: z.string().datetime().nullable(),
  totalTon: z.number().nonnegative(),
  chemistry: ChemistrySchema,
  quality: QualitySchema,
  qualityStatus: StockpileQualityStatusSchema,
  mixCount: z.number().int().nonnegative(),
  layerCount: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});

export const StockpileLayerSchema = z.object({
  id: z.string().uuid(),
  lotId: z.string().uuid(),
  lotNo: z.string(),
  lotStatus: StockpileLotStatusSchema,
  label: z.string().nullable(),
  startPosition: z.number(),
  endPosition: z.number(),
  bottomLevel: z.number(),
  topLevel: z.number(),
  startDepth: LevelSchema.optional(),
  endDepth: LevelSchema.optional(),
  version: z.number().int().positive(),
  mixes: z.array(StockpileMixSummarySchema),
  totalTon: z.number().nonnegative(),
  chemistry: ChemistrySchema,
  quality: QualitySchema,
  qualityStatus: StockpileQualityStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const ReclaimerPositionSchema = z.object({
  eventId: z.string().uuid(),
  position: z.number(),
  effectiveAt: z.string().datetime(),
  createdByName: z.string(),
});

export const StockpileMapQuerySchema = z.object({
  layoutId: z.string().uuid(),
  lotStatus: StockpileLotStatusFilterSchema.default('ACTIVE'),
  asOf: z.string().date().optional(),
});

export const AvailableStockpileMixesQuerySchema = z.object({
  layoutId: z.string().uuid(),
  placement: z.enum(['UNPLACED', 'ALL']).default('UNPLACED'),
});

export const CreateStockpileLayerRequestSchema = z.object({
  layoutId: z.string().uuid(),
  lotId: z.string().uuid().optional(),
  logicalPileId: z.string().uuid().optional(),
  lotNoMode: StockpileLotNoModeSchema.default('PILE_CYCLE'),
  lotNo: LotNoSchema.optional(),
  pileCycle: z.coerce.number().int().positive().optional(),
  mixIds: z.array(z.string().uuid()).min(1).max(30).refine((values) => new Set(values).size === values.length, 'Mix tidak boleh duplikat.'),
  label: z.string().trim().max(120).nullable().optional(),
  startPosition: CoordinateSchema,
  endPosition: CoordinateSchema,
  bottomLevel: LevelSchema,
  topLevel: LevelSchema,
  startDepth: LevelSchema.optional(),
  endDepth: LevelSchema.optional(),
}).superRefine((value, ctx) => {
  if (!value.lotId && !value.logicalPileId) ctx.addIssue({ code: 'custom', path: ['logicalPileId'], message: 'Logical pile wajib untuk lot baru.' });
  if (!value.lotId && !value.pileCycle) ctx.addIssue({ code: 'custom', path: ['pileCycle'], message: 'Pile cycle wajib untuk lot baru.' });
  if (!value.lotId && value.lotNoMode === 'MANUAL' && !value.lotNo) ctx.addIssue({ code: 'custom', path: ['lotNo'], message: 'Nomor lot manual wajib.' });
  if (value.startPosition === value.endPosition) ctx.addIssue({ code: 'custom', path: ['endPosition'], message: 'Rentang posisi harus memiliki panjang.' });
  if (value.topLevel <= value.bottomLevel) ctx.addIssue({ code: 'custom', path: ['topLevel'], message: 'Level atas harus lebih besar dari level bawah.' });
});

export const UpdateStockpileLayerRequestSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
  mixIds: z.array(z.string().uuid()).min(1).max(30).refine((values) => new Set(values).size === values.length, 'Mix tidak boleh duplikat.').optional(),
  label: z.string().trim().max(120).nullable().optional(),
  startPosition: CoordinateSchema.optional(),
  endPosition: CoordinateSchema.optional(),
  bottomLevel: LevelSchema.optional(),
  topLevel: LevelSchema.optional(),
  startDepth: LevelSchema.optional(),
  endDepth: LevelSchema.optional(),
}).refine((value) => Object.keys(value).some((key) => key !== 'expectedVersion'), { message: 'Tidak ada field yang diubah.' });

export const UpdateStockpileLotRequestSchema = z.object({
  status: StockpileLotStatusSchema.optional(),
  lotNoMode: StockpileLotNoModeSchema.optional(),
  lotNo: LotNoSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, { message: 'Tidak ada field yang diubah.' });

export const SaveReclaimerPositionRequestSchema = z.object({
  layoutId: z.string().uuid(),
  position: CoordinateSchema,
  expectedEventId: z.string().uuid().nullable().optional(),
  effectiveAt: z.string().datetime().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const StockpileMapResponseSchema = z.object({
  ok: z.literal(true),
  asOf: z.string().date(),
  isHistorical: z.boolean(),
  geometryEditing: z.boolean().optional(),
  layout: WarehouseLayoutSchema,
  zones: z.array(WarehouseZoneSchema),
  lots: z.array(StockpileLotSchema),
  layers: z.array(StockpileLayerSchema),
  reclaimer: ReclaimerPositionSchema.nullable(),
  counts: z.object({ activeLots: z.number().int().nonnegative(), reclaimedLots: z.number().int().nonnegative(), unplacedMixes: z.number().int().nonnegative() }),
});

export type StockpileLotStatus = z.infer<typeof StockpileLotStatusSchema>;
export type StockpileLotStatusFilter = z.infer<typeof StockpileLotStatusFilterSchema>;
export type StockpileLotNoMode = z.infer<typeof StockpileLotNoModeSchema>;
export type StockpileQualityStatus = z.infer<typeof StockpileQualityStatusSchema>;
export type WarehouseLayout = z.infer<typeof WarehouseLayoutSchema>;
export type WarehouseZone = z.infer<typeof WarehouseZoneSchema>;
export type StockpileMixSummary = z.infer<typeof StockpileMixSummarySchema>;
export type StockpileLot = z.infer<typeof StockpileLotSchema>;
export type StockpileLayer = z.infer<typeof StockpileLayerSchema>;
export type ReclaimerPosition = z.infer<typeof ReclaimerPositionSchema>;
export type StockpileMapResponse = z.infer<typeof StockpileMapResponseSchema>;
export type CreateStockpileLayerRequest = z.infer<typeof CreateStockpileLayerRequestSchema>;
export type UpdateStockpileLayerRequest = z.infer<typeof UpdateStockpileLayerRequestSchema>;
export type UpdateStockpileLotRequest = z.infer<typeof UpdateStockpileLotRequestSchema>;
export type SaveReclaimerPositionRequest = z.infer<typeof SaveReclaimerPositionRequestSchema>;
