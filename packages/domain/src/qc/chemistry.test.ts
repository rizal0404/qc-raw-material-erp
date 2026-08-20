import { describe, expect, it } from 'vitest';
import { aggregateWeightedChemistry, calculateQuality } from './chemistry';

const chem = { sio2: 10, al2o3: 3, fe2o3: 2, cao: 45, mgo: 1, k2o: .5, na2o: .2, so3: .1, h2o: 2 };
describe('legacy chemistry parity', () => {
  it('calculates LSF/SM/AM/NaEq/R2O3 with V2.8 formulas', () => {
    const q = calculateQuality(chem);
    expect(q.lsf).toBeCloseTo(100*45/(2.8*10+1.18*3+.65*2), 10);
    expect(q.sm).toBeCloseTo(2, 10);
    expect(q.am).toBeCloseTo(1.5, 10);
    expect(q.naeq).toBeCloseTo(.2+.658*.5, 10);
    expect(q.r2o3).toBeCloseTo(15, 10);
  });
  it('weights oxide by tonnage before deriving quality', () => {
    const result = aggregateWeightedChemistry([{ tonnage: 25, chemistry: chem }, { tonnage: 75, chemistry: { ...chem, cao: 50 } }]);
    expect(result.chemistry.cao).toBeCloseTo(48.75, 10);
    expect(result.tonnage).toBe(100);
  });
  it('preserves V2.8 total-ton denominator when one selected row has a missing oxide', () => {
    const result = aggregateWeightedChemistry([
      { tonnage: 25, chemistry: chem },
      { tonnage: 75, chemistry: { ...chem, cao: null } },
    ]);
    // V2.8 divides the available weighted CaO contribution by all selected tonnage: 25*45 / 100.
    expect(result.chemistry.cao).toBeCloseTo(11.25, 10);
  });
});
