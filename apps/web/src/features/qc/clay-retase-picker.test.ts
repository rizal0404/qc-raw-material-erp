import { describe,expect,it } from 'vitest';
import type { ClayWorkbenchSource } from '@qc/contracts';
import { claySourceLabel,remainingClayRetase } from './clay-retase-picker';

const source={columnId:'a',headerPrimary:'BUFFER',headerSecondary:'TRASS',availableRetase:8} as ClayWorkbenchSource;
describe('direct Clay workbench',()=>{
  it('retains the dynamic paper column identity',()=>expect(claySourceLabel(source)).toBe('BUFFER / TRASS'));
  it('subtracts pending uses across multiple samples',()=>expect(remainingClayRetase(source,[],[{columnId:'a',retase:3},{columnId:'a',retase:2}])).toBe(3));
  it('only credits the recalled mix, not another mix',()=>expect(remainingClayRetase(source,[{columnId:'a',retase:4}],[{columnId:'a',retase:4}])).toBe(8));
  it('does not borrow capacity from another column',()=>expect(remainingClayRetase(source,[{columnId:'b',retase:20}],[{columnId:'a',retase:9}])).toBe(0));
});
