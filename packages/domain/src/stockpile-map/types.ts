import type { Chemistry, MaterialKind, Quality, StockpileLotNoMode, StockpileLotStatus } from '@qc/contracts';

export interface WarehousePostMark { position: number; label: string; }
export interface WarehouseLayoutRecord {
  id: string; code: string; name: string; materialKind: MaterialKind; plantId: string; plantCode: string; plantName: string;
  axisLength: number; maxLevel: number; postMarks: WarehousePostMark[]; hopperSide: 'START'|'END'; active: boolean; createdAt: Date; updatedAt: Date;
}
export interface WarehouseZoneRecord {
  id: string; layoutId: string; code: string; label: string; kind: 'FILLER'|'HOPPER'|'LOADER_FEED'|'DIVIDER'|'TRACK'|'LABEL';
  startPosition: number; endPosition: number; bottomLevel: number; topLevel: number; displayOrder: number;
}
export interface StockpileLotRecord {
  id: string; layoutId: string; logicalPileId: string; logicalPileCode: string; logicalPileName: string; className: string | null;
  lotNo: string; lotNoMode: StockpileLotNoMode; pileCycle: number; status: StockpileLotStatus; reclaimedAt: Date | null; createdAt: Date; updatedAt: Date;
}
export interface StockpileLayerRecord {
  id: string; lotId: string; layoutId: string; lotNo: string; lotStatus: StockpileLotStatus; label: string | null;
  startPosition: number; endPosition: number; bottomLevel: number; topLevel: number; startDepth?: number; endDepth?: number; version: number; createdAt: Date; updatedAt: Date;
}
export interface StockpileMixSummaryRecord {
  layerId?: string;
  mixId: string; mixCode: string; materialKind: MaterialKind; operationDate: string; plantId: string | null; pileId: string; pileCode: string; pileName: string;
  className: string | null; pileCycle: number; batchNo: number | null; tiangKe: string | null; totalTon: number; chemistry: Chemistry; quality: Quality;
}
export interface ReclaimerPositionRecord { id: string; layoutId: string; position: number; effectiveAt: Date; createdBy: string; createdByName: string; createdAt: Date; }

export interface AggregatedStockpileQuality { totalTon: number; chemistry: Chemistry; quality: Quality; mixCount: number; }
