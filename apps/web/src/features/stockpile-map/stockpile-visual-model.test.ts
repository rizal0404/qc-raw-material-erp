import { describe, expect, it } from 'vitest';
import { chronologicalLayers, contrastColor, layerColor, layerPeriod, layerVertices, LAYER_INDICES, NO_DATA_COLOR, periodLabel, pileColor, SCENE, sceneX, sceneY, TIME_COLORS, timeColor, timeDomain } from './stockpile-visual-model';
import { testLayer, testMap } from './stockpile-test-fixture';

describe('stockpile time and colour semantics', () => {
  it('uses the full Mix date range, never record creation time', () => {
    const layer = testLayer();
    layer.mixes.push({ ...layer.mixes[0]!, mixId: '2', operationDate: '2026-08-25' });
    expect(layerPeriod(layer)).toEqual({ start: '2026-08-20', end: '2026-08-25' });
    expect(periodLabel(layer)).toBe('2026-08-20 – 2026-08-25');
    expect(layerPeriod(testLayer({ mixes: [] }))).toEqual({ start: null, end: null });
  });
  it('ignores missing/invalid dates and does not manufacture fill timestamps', () => {
    const layer = testLayer();
    layer.mixes[0]!.operationDate = '2026-02-31';
    expect(layerPeriod(layer).start).toBeNull();
    expect(layerColor(layer, 'TIME', testMap([layer]))).toBe(NO_DATA_COLOR);
    expect(timeDomain([])).toEqual({ start: null, end: null });
  });
  it('sorts deterministically, missing dates last, without mutating the input', () => {
    const old = testLayer({ id: 'old', createdAt: '2026-08-30T00:00:00Z' });
    const recent = testLayer({ id: 'recent' }); recent.mixes[0]!.operationDate = '2026-08-25';
    const missing = testLayer({ id: 'missing', mixes: [] });
    const input = [missing, recent, old];
    expect(chronologicalLayers(input).map(item => item.id)).toEqual(['old', 'recent', 'missing']);
    expect(input[0]).toBe(missing);
  });
  it('uses neutral mid-ramp colour for a single day and distinct endpoints otherwise', () => {
    const old = testLayer();
    const recent = testLayer({ id: 'recent' }); recent.mixes[0]!.operationDate = '2026-08-25';
    expect(layerColor(old, 'TIME', testMap())).toBe(timeColor(.5));
    expect(layerColor(old, 'TIME', testMap([old, recent]))).toBe(TIME_COLORS[0]);
    expect(layerColor(recent, 'TIME', testMap([old, recent]))).toBe(TIME_COLORS.at(-1));
    expect(timeColor(-10)).toBe(TIME_COLORS[0]);
    expect(timeColor(10)).toBe(TIME_COLORS.at(-1));
    expect(timeColor(NaN)).toBe(timeColor(.5));
  });
  it('keeps pile colours stable when lot filters or ordering change', () => {
    const layer = testLayer();
    expect(layerColor(layer, 'PILE', testMap())).toBe(pileColor(layer.lotId));
    expect(pileColor('lot-1')).toBe(pileColor('lot-1'));
  });
  it('preserves quality/status thresholds and no-data semantics', () => {
    const layer = testLayer({ qualityStatus: 'CHECK' });
    expect(layerColor(layer, 'STATUS', testMap())).toBe('#f4c95d');
    expect(layerColor(layer, 'PRIMARY', testMap())).toBe('#54c6df');
    layer.quality = { ...layer.quality, lsf: null };
    expect(layerColor(layer, 'PRIMARY', testMap())).toBe(NO_DATA_COLOR);
    const data = testMap([layer]); data.layout.materialKind = 'CL';
    expect(layerColor(layer, 'PRIMARY', data)).toBe('#54c6df');
  });
  it('chooses legible text colours', () => {
    expect(contrastColor('#ffffff')).toBe('#142431');
    expect(contrastColor('#000000')).toBe('#ffffff');
  });
});

describe('schematic pile geometry', () => {
  it('maps domain endpoints without confusing reversed post labels with coordinates', () => {
    const { layout } = testMap();
    expect(sceneX(0, layout)).toBe(-SCENE.length / 2);
    expect(sceneX(layout.axisLength, layout)).toBe(SCENE.length / 2);
    expect(sceneY(layout.maxLevel, layout)).toBe(SCENE.height);
  });
  it('builds a closed tapered prism with outward normals', () => {
    const vertices = layerVertices(testLayer(), testMap().layout);
    expect(vertices).toHaveLength(24);
    expect(Math.abs(vertices[14]!)).toBeLessThan(Math.abs(vertices[2]!));
    const center = [0, 1, 2].map(axis => vertices.filter((_, index) => index % 3 === axis).reduce((a, b) => a + b, 0) / 8);
    for (let index = 0; index < LAYER_INDICES.length; index += 3) {
      const [a, b, c] = LAYER_INDICES.slice(index, index + 3).map(vertex => vertices.slice(vertex * 3, vertex * 3 + 3));
      const u = b!.map((value, axis) => value - a![axis]!);
      const v = c!.map((value, axis) => value - a![axis]!);
      const normal = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
      const outward = normal.reduce((sum, value, axis) => sum + value * (a![axis]! - center[axis]!), 0);
      expect(outward).toBeGreaterThan(0);
    }
  });
  it('makes adjoining layers share their physical boundary', () => {
    const lower = layerVertices(testLayer(), testMap().layout);
    const upper = layerVertices(testLayer({ bottomLevel: 1, topLevel: 2 }), testMap().layout);
    expect(lower.slice(12)).toEqual(upper.slice(0, 12));
  });
  it('separation changes only visual Y, never stored positions or width', () => {
    const layer = testLayer({ bottomLevel: 1, topLevel: 2 });
    const snapshot = JSON.stringify(layer);
    const base = layerVertices(layer, testMap().layout);
    const separated = layerVertices(layer, testMap().layout, 1);
    base.forEach((value, index) => index % 3 === 1 ? expect(separated[index]).toBeGreaterThan(value) : expect(separated[index]).toBe(value));
    expect(JSON.stringify(layer)).toBe(snapshot);
  });
});
