import type { AuditWriteInput } from '../master/types';
import type { StockpileLotNoMode, StockpileLotStatus, StockpileLotStatusFilter } from '@qc/contracts';
import type { ReclaimerPositionRecord, StockpileLayerRecord, StockpileLotRecord, StockpileMixSummaryRecord, WarehouseLayoutRecord, WarehouseZoneRecord } from './types';

export interface CreateStockpileLayerRepositoryInput {
  layoutId:string;
  lot:{id?:string;logicalPileId:string;lotNo:string;lotNoMode:StockpileLotNoMode;pileCycle:number};
  layer:{label:string|null;startPosition:number;endPosition:number;bottomLevel:number;topLevel:number;startDepth:number;endDepth:number};
  mixIds:string[];
  actorUserId:string;
}
export interface UpdateStockpileLayerRepositoryInput {
  id:string;layoutId:string;expectedVersion:number;label:string|null;startPosition:number;endPosition:number;bottomLevel:number;topLevel:number;startDepth:number;endDepth:number;mixIds:string[];actorUserId:string;
}
export interface UpdateStockpileLotRepositoryInput { id:string;status:StockpileLotStatus;lotNo:string;lotNoMode:StockpileLotNoMode;actorUserId:string; }

export interface StockpileMapRepository {
  listLayouts():Promise<WarehouseLayoutRecord[]>;
  findLayout(id:string):Promise<WarehouseLayoutRecord|null>;
  listZones(layoutId:string):Promise<WarehouseZoneRecord[]>;
  listLots(layoutId:string,status:StockpileLotStatusFilter,asOf?:Date):Promise<StockpileLotRecord[]>;
  findLot(id:string):Promise<StockpileLotRecord|null>;
  listLayers(layoutId:string,status:StockpileLotStatusFilter,asOf?:Date):Promise<StockpileLayerRecord[]>;
  findLayer(id:string):Promise<StockpileLayerRecord|null>;
  listLayerMixes(layerIds:string[],asOf?:Date):Promise<StockpileMixSummaryRecord[]>;
  listAvailableMixes(layoutId:string,onlyUnplaced:boolean):Promise<StockpileMixSummaryRecord[]>;
  findMixes(ids:string[]):Promise<StockpileMixSummaryRecord[]>;
  createLayer(input:CreateStockpileLayerRepositoryInput):Promise<{lotId:string;layerId:string}>;
  updateLayer(input:UpdateStockpileLayerRepositoryInput):Promise<void>;
  updateLot(input:UpdateStockpileLotRepositoryInput):Promise<void>;
  latestReclaimerPosition(layoutId:string,asOf?:Date):Promise<ReclaimerPositionRecord|null>;
  appendReclaimerPosition(input:{layoutId:string;position:number;effectiveAt:Date;expectedEventId:string|null;reason:string|null;actorUserId:string}):Promise<ReclaimerPositionRecord>;
  countLots(layoutId:string,status:StockpileLotStatus,asOf?:Date):Promise<number>;
  countUnplacedMixes(layoutId:string,asOf?:Date):Promise<number>;
  appendAudit(input:AuditWriteInput):Promise<void>;
}
