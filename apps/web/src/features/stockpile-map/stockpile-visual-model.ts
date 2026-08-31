import { geometryOf } from './layer-geometry';
import type { LayerGeometry } from './layer-geometry';
import type { StockpileLayer, StockpileMapResponse, WarehouseLayout } from './stockpile-map-api';

export type ColorMode = 'TIME' | 'STATUS' | 'PRIMARY' | 'PILE';
export type CameraPreset = 'PERSPECTIVE' | 'SIDE' | 'TOP';
export type WarehouseMapProps = {
  data: StockpileMapResponse;
  colorMode: ColorMode;
  selectedLayerId: string | null;
  onSelectLayer: (layer: StockpileLayer) => void;
  recPosition: number;
  onRecPositionChange: (position: number) => void;
  readOnly?: boolean;
  geometryLocked?: boolean;
  onSaveGeometry?: (layer: StockpileLayer, geometry: LayerGeometry) => Promise<void>;
  onReloadGeometry?: () => Promise<void>;
};

export const NO_DATA_COLOR = '#a5b3c1';
export const TIME_COLORS = ['#3549a2', '#238baf', '#46b6a2', '#ddca63', '#ed9349'];
const PILE_COLORS = ['#eeac85', '#eccb62', '#91be65', '#87aedd', '#55b9cc', '#b88bcb'];
export const formatValue = (value: number | null | undefined, digits = 2) =>
  value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('id-ID', { maximumFractionDigits: digits });

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

// Operation dates describe the Mix, not a surveyed physical deposition timestamp.
// Missing dates stay unknown: record creation time must never masquerade as fill time.
export function layerPeriod(layer: StockpileLayer) {
  const dates = layer.mixes.map(mix => mix.operationDate).filter(validDate).sort();
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
}

export function periodLabel(layer: StockpileLayer) {
  const { start, end } = layerPeriod(layer);
  return !start ? 'Tanggal Mix tidak tersedia' : start === end ? start : `${start} – ${end}`;
}

export function chronologicalLayers(layers: StockpileLayer[]) {
  return [...layers].sort((a, b) => {
    const aDate = layerPeriod(a).start ?? '9999-12-31';
    const bDate = layerPeriod(b).start ?? '9999-12-31';
    return aDate.localeCompare(bDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  });
}

export function timeDomain(layers: StockpileLayer[]) {
  const dates = layers.flatMap(layer => {
    const period = layerPeriod(layer);
    return period.start && period.end ? [period.start, period.end] : [];
  }).sort();
  return { start: dates[0] ?? null, end: dates.at(-1) ?? null };
}

export function timeColor(ratio: number) {
  const position = Math.max(0, Math.min(1, Number.isFinite(ratio) ? ratio : .5)) * (TIME_COLORS.length - 1);
  const index = Math.min(Math.floor(position), TIME_COLORS.length - 2);
  const fraction = position - index;
  const a = TIME_COLORS[index]!;
  const b = TIME_COLORS[index + 1]!;
  return '#' + [1, 3, 5].map(offset => Math.round(
    parseInt(a.slice(offset, offset + 2), 16) * (1 - fraction) + parseInt(b.slice(offset, offset + 2), 16) * fraction,
  ).toString(16).padStart(2, '0')).join('');
}

export function pileColor(id: string) {
  let hash = 0;
  for (const char of id) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return PILE_COLORS[hash % PILE_COLORS.length]!;
}

export function createLayerColorScale(mode: ColorMode, data: StockpileMapResponse) {
  const domain = mode === 'TIME' ? timeDomain(data.layers) : { start: null, end: null };
  return (layer: StockpileLayer) => layerColor(layer, mode, data, domain);
}

export function layerColor(layer: StockpileLayer, mode: ColorMode, data: StockpileMapResponse, domain?: ReturnType<typeof timeDomain>) {
  if (mode === 'PILE') return pileColor(layer.lotId);
  if (mode === 'TIME') {
    const period = layerPeriod(layer);
    const range = domain ?? timeDomain(data.layers);
    if (!period.start || !range.start || !range.end) return NO_DATA_COLOR;
    const start = Date.parse(range.start);
    const span = Date.parse(range.end) - start;
    return timeColor(span ? (Date.parse(period.start) - start) / span : .5);
  }
  if (mode === 'PRIMARY') {
    const clay = data.layout.materialKind === 'CL';
    const value = clay ? layer.quality.sm : layer.quality.lsf;
    if (value == null || !Number.isFinite(value)) return NO_DATA_COLOR;
    return value < (clay ? 2.3 : 1200) ? '#c77dcf' : value > (clay ? 2.8 : 1300) ? '#f0a35c' : '#54c6df';
  }
  return layer.qualityStatus === 'OK' ? '#7bcf65' : layer.qualityStatus === 'CHECK' ? '#f4c95d' : NO_DATA_COLOR;
}

export function contrastColor(hex: string) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0]! * .2126 + rgb[1]! * .7152 + rgb[2]! * .0722 > .24 ? '#142431' : '#ffffff';
}

// Presentation units only. Depth is persisted as a percentage; taper is schematic.
// Never derive physical volume/tonnage from this visual.
export const SCENE = { length: 30, height: 5, depth: 8 };
export const sceneX = (position: number, layout: WarehouseLayout) => position / layout.axisLength * SCENE.length - SCENE.length / 2;
export const sceneY = (level: number, layout: WarehouseLayout) => level / layout.maxLevel * SCENE.height;
export function layerVertices(layer: StockpileLayer, layout: WarehouseLayout, separation = 0) {
  const x0 = sceneX(layer.startPosition, layout), x1 = sceneX(layer.endPosition, layout);
  const offset = layer.bottomLevel / layout.maxLevel * Math.max(0, Math.min(1, separation)) * 4;
  const y0 = sceneY(layer.bottomLevel, layout) + offset, y1 = sceneY(layer.topLevel, layout) + offset;
  const g = geometryOf(layer, layout);
  const center = ((g.startDepth + g.endDepth) / 200 - .5) * SCENE.depth;
  const z0 = (g.endDepth - g.startDepth) / 200 * SCENE.depth;
  const z1 = z0 * (1 - .78 * layer.topLevel / layout.maxLevel) / (1 - .78 * layer.bottomLevel / layout.maxLevel);
  return [x0, y0, center-z0, x1, y0, center-z0, x1, y0, center+z0, x0, y0, center+z0,
    x0, y1, center-z1, x1, y1, center-z1, x1, y1, center+z1, x0, y1, center+z1];
}

// Closed prism, counter-clockwise outward faces (bottom, top, back, right, front, left).
export const LAYER_INDICES = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6,
  0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0];
