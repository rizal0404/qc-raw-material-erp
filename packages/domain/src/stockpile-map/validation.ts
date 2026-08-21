import type { StockpileQualityStatus } from '@qc/contracts';
import { aggregateWeightedChemistry } from '../qc/chemistry';
import { qafStatus } from '../qc/qaf';
import type { QafRuleSet } from '../qc/qaf';
import type { AggregatedStockpileQuality, StockpileMixSummaryRecord, WarehouseLayoutRecord } from './types';

export interface StockpileRectangle { startPosition:number; endPosition:number; bottomLevel:number; topLevel:number; }

export function normalizeStockpileRectangle(rectangle:StockpileRectangle):StockpileRectangle {
  return {
    startPosition:Math.min(rectangle.startPosition,rectangle.endPosition),
    endPosition:Math.max(rectangle.startPosition,rectangle.endPosition),
    bottomLevel:rectangle.bottomLevel,
    topLevel:rectangle.topLevel,
  };
}

export function validateStockpileRectangle(layout:Pick<WarehouseLayoutRecord,'axisLength'|'maxLevel'>,rectangle:StockpileRectangle):StockpileRectangle {
  const normalized=normalizeStockpileRectangle(rectangle);
  for(const value of Object.values(normalized))if(!Number.isFinite(value))throw new Error('Koordinat dan level harus berupa angka finite.');
  if(normalized.startPosition<0||normalized.endPosition>layout.axisLength)throw new Error(`Posisi layer harus berada pada sumbu 0-${layout.axisLength}.`);
  if(normalized.startPosition===normalized.endPosition)throw new Error('Rentang posisi layer harus memiliki panjang.');
  if(normalized.bottomLevel<0||normalized.topLevel>layout.maxLevel||normalized.topLevel<=normalized.bottomLevel)throw new Error(`Level fisik harus berada pada 0-${layout.maxLevel} dan level atas harus lebih besar.`);
  return normalized;
}

export function stockpileRectanglesOverlap(a:StockpileRectangle,b:StockpileRectangle):boolean {
  const x=Math.max(a.startPosition,b.startPosition)<Math.min(a.endPosition,b.endPosition);
  const y=Math.max(a.bottomLevel,b.bottomLevel)<Math.min(a.topLevel,b.topLevel);
  return x&&y;
}

export function aggregateStockpileMixes(mixes:readonly StockpileMixSummaryRecord[]):AggregatedStockpileQuality {
  const aggregate=aggregateWeightedChemistry(mixes.map((mix)=>({tonnage:mix.totalTon,chemistry:mix.chemistry})));
  return{totalTon:aggregate.tonnage,chemistry:aggregate.chemistry,quality:aggregate.quality,mixCount:mixes.length};
}

export function stockpileQualityStatus(materialKind:'LS'|'CL',className:string|null,aggregate:AggregatedStockpileQuality,rules:QafRuleSet):StockpileQualityStatus {
  const status=qafStatus(materialKind,className,aggregate.totalTon,aggregate.quality,rules);
  return status==='NO DATA'?'NO_DATA':status;
}
