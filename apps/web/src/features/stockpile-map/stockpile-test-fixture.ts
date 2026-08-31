import type { StockpileLayer, StockpileMapResponse } from './stockpile-map-api';

const chemistry = { sio2: 3, al2o3: 1, fe2o3: 1, cao: 50, mgo: .2, k2o: null, na2o: null, so3: null, h2o: null };
const quality = { lsf: 1250, sm: 2.5, am: 1, naeq: null, r2o3: 2 };
export function testLayer(overrides: Partial<StockpileLayer> = {}): StockpileLayer {
  return { id: 'layer-1', lotId: 'lot-1', lotNo: '12', lotStatus: 'ACTIVE', label: null,
    startPosition: 0, endPosition: 5, bottomLevel: 0, topLevel: 1, version: 1,
    mixes: [{ mixId: 'mix-1', mixCode: 'MIX-1', materialKind: 'LS', operationDate: '2026-08-20',
      pileId: 'pile-1', pileCode: 'PILE-1', pileName: 'Timur', className: null, pileCycle: 12,
      batchNo: 1, tiangKe: null, totalTon: 500, chemistry, quality }],
    totalTon: 500, chemistry, quality, qualityStatus: 'OK',
    createdAt: '2026-08-21T00:00:00Z', updatedAt: '2026-08-21T00:00:00Z', ...overrides };
}
export function testMap(layers = [testLayer()]): StockpileMapResponse {
  return { ok: true, asOf: '2026-08-31', isHistorical: false,
    layout: { id: 'layout-1', code: 'LS_4', name: 'Gudang Uji', materialKind: 'LS', plantId: 'plant-1', plantCode: 'P1', plantName: 'Plant Uji',
      axisLength: 10, maxLevel: 3, postMarks: [{ position: 0, label: '10' }, { position: 5, label: '5' }, { position: 10, label: '0' }], hopperSide: 'START', active: true },
    zones: [], lots: [{ id: 'lot-1', layoutId: 'layout-1', logicalPileId: 'pile-1', logicalPileCode: 'P1', logicalPileName: 'Timur', className: null,
      lotNo: '12', lotNoMode: 'PILE_CYCLE', pileCycle: 12, status: 'ACTIVE', reclaimedAt: null, totalTon: 500, chemistry, quality, qualityStatus: 'OK',
      mixCount: layers.length, layerCount: layers.length, updatedAt: '2026-08-31T00:00:00Z' }], layers, reclaimer: null,
    counts: { activeLots: 1, reclaimedLots: 0, unplacedMixes: 0 } };
}
