// Synthetic visual QA only. No persistence, network requests or operational data.
export function stockpilePreview(layout, params, today) {
  const asOf = params.get('asOf') || today;
  const lotStatus = params.get('lotStatus') || 'ACTIVE';
  const chemistry = { sio2: 3.5, al2o3: 1.2, fe2o3: .8, cao: 51, mgo: .6, k2o: null, na2o: null, so3: null, h2o: 4 };
  const quality = { lsf: 1250, sm: 2.5, am: 1.5, naeq: null, r2o3: 2 };
  const shiftDate = offset => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const lots = ['Timur', 'Barat'].map((name, index) => ({ id: `lot-${layout.id}-${index}`, layoutId: layout.id, logicalPileId: `pile-${index}`,
    logicalPileCode: `PILE-${index}`, logicalPileName: `Pile ${name}`, className: name, lotNo: String(21 + index), lotNoMode: 'PILE_CYCLE', pileCycle: 21 + index,
    status: 'ACTIVE', reclaimedAt: null, totalTon: 2250, chemistry, quality, qualityStatus: index ? 'CHECK' : 'OK', mixCount: 5, layerCount: 5, updatedAt: `${today}T00:00:00Z` }));
  const layers = lots.flatMap((lot, pileIndex) => Array.from({ length: 5 }, (_, index) => {
    const operationDate = shiftDate(-7 + index + pileIndex * 2);
    const q = { ...quality, lsf: 1160 + index * 45, sm: 2.1 + index * .2 };
    const mix = { mixId: `mix-${lot.id}-${index}`, mixCode: `MIX-${layout.materialKind}-${index + pileIndex * 5 + 1}`, materialKind: layout.materialKind,
      operationDate, pileId: lot.logicalPileId, pileCode: lot.logicalPileCode, pileName: lot.logicalPileName, className: lot.className, pileCycle: lot.pileCycle,
      batchNo: layout.materialKind === 'LS' ? 138 + index : null, tiangKe: layout.materialKind === 'CL' ? `${pileIndex ? 6 : 12}–${pileIndex ? 0 : 7}` : null,
      totalTon: 450, chemistry, quality: q };
    return { id: `layer-${lot.id}-${index}`, lotId: lot.id, lotNo: lot.lotNo, lotStatus: 'ACTIVE', label: null,
      startPosition: pileIndex ? 6.4 : .3, endPosition: pileIndex ? 11.7 : 5.6, bottomLevel: index * .7, topLevel: (index + 1) * .7,
      version: 1, mixes: [mix], totalTon: 450, chemistry, quality: q, qualityStatus: index === 4 ? 'CHECK' : 'OK',
      createdAt: `${operationDate}T10:00:00+08:00`, updatedAt: `${operationDate}T10:00:00+08:00` };
  })).filter(layer => layer.mixes[0].operationDate <= asOf && lotStatus !== 'RECLAIMED');
  const visibleLots = lots.filter(lot => layers.some(layer => layer.lotId === lot.id));
  return { ok: true, asOf, isHistorical: asOf < today,
    layout: { ...layout, name: `Gudang ${layout.materialKind} · Preview sintetis`, postMarks: Array.from({ length: 13 }, (_, position) => ({ position, label: String(12 - position) })) },
    zones: [{ id: 'divider', code: 'DIVIDER', label: 'BATAS PILE', kind: 'DIVIDER', startPosition: 5.85, endPosition: 6.15, bottomLevel: 0, topLevel: 4, displayOrder: 0 }],
    lots: visibleLots, layers, reclaimer: { eventId: 'rec-preview', position: 7.1, effectiveAt: `${asOf}T00:00:00Z`, createdByName: 'Preview' },
    counts: { activeLots: visibleLots.length, reclaimedLots: 0, unplacedMixes: 2 } };
}
