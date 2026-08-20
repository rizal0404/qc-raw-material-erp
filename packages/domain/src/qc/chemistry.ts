import type { Chemistry, Quality } from '@qc/contracts';

export const CHEMISTRY_KEYS = ['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;
export type ChemistryKey = typeof CHEMISTRY_KEYS[number];

function safeDiv(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || !Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

export function calculateQuality(c: Chemistry): Quality {
  const { sio2, al2o3, fe2o3, cao, k2o, na2o } = c;
  const lsfDen = [sio2, al2o3, fe2o3].every((v) => v !== null)
    ? 2.8 * (sio2 as number) + 1.18 * (al2o3 as number) + 0.65 * (fe2o3 as number)
    : null;
  return {
    lsf: safeDiv(cao === null ? null : 100 * cao, lsfDen),
    sm: safeDiv(sio2, al2o3 !== null && fe2o3 !== null ? al2o3 + fe2o3 : null),
    am: safeDiv(al2o3, fe2o3),
    naeq: na2o !== null && k2o !== null ? na2o + 0.658 * k2o : null,
    r2o3: sio2 !== null && al2o3 !== null && fe2o3 !== null ? sio2 + al2o3 + fe2o3 : null,
  };
}

export function chemistryEquals(a: Chemistry, b: Chemistry, epsilon = 1e-9): boolean {
  return CHEMISTRY_KEYS.every((key) => {
    const x = a[key]; const y = b[key];
    if (x === null && y === null) return true;
    if (x === null || y === null) return false;
    return Math.abs(x - y) <= epsilon;
  });
}

export interface WeightedChemistryInput { tonnage: number; chemistry: Chemistry; }
export function aggregateWeightedChemistry(rows: readonly WeightedChemistryInput[]): { tonnage: number; chemistry: Chemistry; quality: Quality } {
  const tonnage = rows.reduce((sum, row) => sum + (Number.isFinite(row.tonnage) && row.tonnage > 0 ? row.tonnage : 0), 0);
  const weighted = Object.fromEntries(CHEMISTRY_KEYS.map((key) => [key, 0])) as Record<ChemistryKey, number>;
  const present = Object.fromEntries(CHEMISTRY_KEYS.map((key) => [key, false])) as Record<ChemistryKey, boolean>;
  for (const row of rows) {
    if (!Number.isFinite(row.tonnage) || row.tonnage <= 0) continue;
    for (const key of CHEMISTRY_KEYS) {
      const value = row.chemistry[key];
      if (value === null || !Number.isFinite(value)) continue;
      weighted[key] += row.tonnage * value;
      present[key] = true;
    }
  }
  const chemistry = Object.fromEntries(CHEMISTRY_KEYS.map((key) => [key, tonnage > 0 && present[key] ? weighted[key] / tonnage : null])) as Chemistry;
  return { tonnage, chemistry, quality: calculateQuality(chemistry) };
}
