import { describe, expect, it } from 'vitest';
import { stockpileDepth, stockpileGeometriesOverlap, validateStockpileGeometry } from './validation';
const layout = { axisLength: 12, maxLevel: 4 };
const geometry = { startPosition: 1, endPosition: 3, bottomLevel: 1, topLevel: 2, startDepth: 20, endDepth: 50 };
describe('stockpile geometry validation', () => {
  it('preserves saved depth when vertical coordinates change', () => {
    expect(validateStockpileGeometry(layout, { ...geometry, bottomLevel: .5 })).toEqual({ ...geometry, bottomLevel: .5 });
    expect(stockpileDepth(layout, { bottomLevel: 1 })).toEqual({ startDepth: 9.75, endDepth: 90.25 });
  });
  it('rounds to the DB precision before checking collapse or overlap', () => {
    expect(validateStockpileGeometry(layout, { ...geometry, endDepth: 50.123456 }).endDepth).toBe(50.1235);
    expect(() => validateStockpileGeometry(layout, { ...geometry, endDepth: 20.000001 })).toThrow();
  });
  it.each([NaN, Infinity, -1, 101])('rejects invalid depth %s', value => {
    expect(() => validateStockpileGeometry(layout, { ...geometry, startDepth: value })).toThrow();
  });
  it('allows side-by-side layers and touching faces, but rejects intersecting volumes', () => {
    expect(stockpileGeometriesOverlap(geometry, { ...geometry, startDepth: 50, endDepth: 80 })).toBe(false);
    expect(stockpileGeometriesOverlap(geometry, { ...geometry, startDepth: 49, endDepth: 80 })).toBe(true);
    expect(stockpileGeometriesOverlap(geometry, { ...geometry, bottomLevel: 2, topLevel: 3 })).toBe(false);
  });
});
