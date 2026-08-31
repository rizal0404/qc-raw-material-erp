import type { StockpileLayer, WarehouseLayout } from './stockpile-map-api';

export type LayerGeometry = Pick<StockpileLayer, 'startPosition' | 'endPosition' | 'bottomLevel' | 'topLevel'> & { startDepth: number; endDepth: number };
export type GeometryGesture = 'MOVE' | 'LENGTH' | 'WIDTH' | 'HEIGHT';
export const roundGeometry = (value: number) => Math.round(value * 1e4) / 1e4;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export function geometryOf(layer: StockpileLayer, layout: WarehouseLayout): LayerGeometry {
  const inset = 39 * layer.bottomLevel / layout.maxLevel;
  return { startPosition: layer.startPosition, endPosition: layer.endPosition, bottomLevel: layer.bottomLevel, topLevel: layer.topLevel,
    startDepth: layer.startDepth ?? inset, endDepth: layer.endDepth ?? 100 - inset };
}

export function geometryError(g: LayerGeometry, layout: WarehouseLayout): string | null {
  if (Object.values(g).some(value => !Number.isFinite(value))) return 'Semua ukuran dan posisi harus berupa angka.';
  if (g.startPosition < 0 || g.endPosition > layout.axisLength || g.endPosition <= g.startPosition) return `Panjang harus positif dan posisi berada pada sumbu 0–${layout.axisLength}.`;
  if (g.bottomLevel < 0 || g.topLevel > layout.maxLevel || g.topLevel <= g.bottomLevel) return `Tinggi harus positif dan level berada pada 0–${layout.maxLevel}.`;
  if (g.startDepth < 0 || g.endDepth > 100 || g.endDepth <= g.startDepth) return 'Lebar harus positif dan posisi melintang berada pada 0–100%.';
  return null;
}

/** Deltas are warehouse units, not screen pixels. Clamping never changes the moved size. */
export function gestureGeometry(base: LayerGeometry, mode: GeometryGesture, delta: { x: number; y: number; z: number }, layout: WarehouseLayout): LayerGeometry {
  const next = { ...base };
  if (mode === 'MOVE') {
    const x = clamp(delta.x, -base.startPosition, layout.axisLength - base.endPosition);
    const y = clamp(delta.y, -base.bottomLevel, layout.maxLevel - base.topLevel);
    const z = clamp(delta.z, -base.startDepth, 100 - base.endDepth);
    next.startPosition += x; next.endPosition += x; next.bottomLevel += y; next.topLevel += y; next.startDepth += z; next.endDepth += z;
  } else if (mode === 'LENGTH') next.endPosition = clamp(base.endPosition + delta.x, base.startPosition + .01, layout.axisLength);
  else if (mode === 'WIDTH') next.endDepth = clamp(base.endDepth + delta.z, base.startDepth + .01, 100);
  else next.topLevel = clamp(base.topLevel + delta.y, base.bottomLevel + .01, layout.maxLevel);
  return Object.fromEntries(Object.entries(next).map(([key, value]) => [key, roundGeometry(value)])) as LayerGeometry;
}

export function sameGeometry(a: LayerGeometry, b: LayerGeometry) {
  return (Object.keys(a) as Array<keyof LayerGeometry>).every(key => Math.abs(a[key] - b[key]) < .00005);
}
