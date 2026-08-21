import type { CreateStockpileLayerRequest, SaveReclaimerPositionRequest, StockpileLayer, StockpileLot, StockpileLotStatusFilter, StockpileMapResponse, StockpileMixSummary, UpdateStockpileLayerRequest, UpdateStockpileLotRequest, WarehouseLayout } from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export function listWarehouseLayouts(){return apiFetch<{ok:true;items:WarehouseLayout[]}>('/stockpile-map/layouts');}
export function getStockpileMap(layoutId:string,lotStatus:StockpileLotStatusFilter){return apiFetch<StockpileMapResponse>(`/stockpile-map?layoutId=${encodeURIComponent(layoutId)}&lotStatus=${lotStatus}`);}
export function listStockpileMixes(layoutId:string,placement:'UNPLACED'|'ALL'='UNPLACED'){return apiFetch<{ok:true;items:StockpileMixSummary[]}>(`/stockpile-map/mixes?layoutId=${encodeURIComponent(layoutId)}&placement=${placement}`);}
export function createStockpileLayer(body:CreateStockpileLayerRequest){return apiFetch<{ok:true;item:{lotId:string;layerId:string}}>('/stockpile-map/layers',{method:'POST',body:JSON.stringify(body)});}
export function updateStockpileLayer(id:string,body:UpdateStockpileLayerRequest){return apiFetch<{ok:true;item:{id:string}}>(`/stockpile-map/layers/${id}`,{method:'PATCH',body:JSON.stringify(body)});}
export function updateStockpileLot(id:string,body:UpdateStockpileLotRequest){return apiFetch<{ok:true;item:{id:string}}>(`/stockpile-map/lots/${id}`,{method:'PATCH',body:JSON.stringify(body)});}
export function saveReclaimerPosition(body:SaveReclaimerPositionRequest){return apiFetch<{ok:true;item:{eventId:string;position:number;effectiveAt:string;createdByName:string}}>('/stockpile-map/reclaimer-events',{method:'POST',body:JSON.stringify(body)});}

export type { StockpileLayer, StockpileLot, StockpileMapResponse, StockpileMixSummary, WarehouseLayout };
