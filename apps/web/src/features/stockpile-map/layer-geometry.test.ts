import { describe, expect, it } from 'vitest';
import { geometryError, geometryOf, gestureGeometry, sameGeometry } from './layer-geometry';
import { layerVertices } from './stockpile-visual-model';
import { testMap } from './stockpile-test-fixture';

describe('editable layer geometry', () => {
  const data = testMap(), layout = data.layout;
  const base = { startPosition: 2, endPosition: 4, bottomLevel: 1, topLevel: 2, startDepth: 20, endDepth: 60 };
  it('uses persisted lateral bounds and a legacy fallback', () => {
    expect(geometryOf({ ...data.layers[0]!, ...base }, layout)).toEqual(base);
    expect(geometryOf({ ...data.layers[0]!, bottomLevel: 0 }, layout).endDepth).toBe(100);
  });
  it('clamps a move at warehouse walls without stretching any dimension', () => {
    const next = gestureGeometry(base, 'MOVE', { x: 999, y: -99, z: 999 }, layout);
    expect(next.endPosition).toBe(layout.axisLength); expect(next.endPosition - next.startPosition).toBe(2);
    expect(next.bottomLevel).toBe(0); expect(next.topLevel).toBe(1);
    expect(next.startDepth).toBe(60); expect(next.endDepth).toBe(100);
  });
  it('resizes one axis only and never inverts a layer', () => {
    expect(gestureGeometry(base, 'LENGTH', { x: -99, y: 99, z: 99 }, layout)).toEqual({ ...base, endPosition: 2.01 });
    expect(gestureGeometry(base, 'WIDTH', { x: 99, y: 99, z: 10 }, layout)).toEqual({ ...base, endDepth: 70 });
    expect(gestureGeometry(base, 'HEIGHT', { x: 99, y: .25, z: 99 }, layout)).toEqual({ ...base, topLevel: 2.25 });
  });
  it('rejects invalid, empty or out-of-bounds dimensions', () => {
    for (const patch of [{ endDepth: 101 }, { startDepth: 60 }, { topLevel: 1 }, { endPosition: NaN }, { startPosition: -1 }])
      expect(geometryError({ ...base, ...patch }, layout)).not.toBeNull();
    expect(geometryError(base, layout)).toBeNull();
    expect(sameGeometry(base, { ...base })).toBe(true);
  });
  it('updates the actual mesh width/position rather than just its labels', () => {
    const vertices = layerVertices({ ...data.layers[0]!, ...base }, layout);
    expect(vertices[2]).toBeCloseTo(-2.4); expect(vertices[8]).toBeCloseTo(.8);
    const shifted = layerVertices({ ...data.layers[0]!, ...base, startDepth: 30, endDepth: 70 }, layout);
    expect(shifted[2]! - vertices[2]!).toBeCloseTo(.8);
  });
});
