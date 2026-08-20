import { describe, expect, it } from 'vitest';
import fixture from './fixtures/legacy-v2.8-parity.json';
import { aggregateWeightedChemistry, calculateQuality } from './chemistry';
import { resolveTonPerRetase, type TonPerRetaseRule } from './ton-per-retase';

const rules:TonPerRetaseRule[]=[
  {id:'1',materialKind:'LS',ruleType:'DEFAULT',matchKey:null,rate:25,priority:1000,active:true},
  {id:'2',materialKind:'CL',ruleType:'MATCH_KEY',matchKey:'Topabiring',rate:30,priority:10,active:true},
  {id:'3',materialKind:'CL',ruleType:'MATCH_KEY',matchKey:'FABA',rate:15,priority:20,active:true},
  {id:'4',materialKind:'CL',ruleType:'DEFAULT',matchKey:null,rate:25,priority:1000,active:true},
];
describe('V2.8 parity fixture',()=>{
  it('matches legacy derived chemistry formulas',()=>{const q=calculateQuality(fixture.chemistryFormula.input);for(const [k,v] of Object.entries(fixture.chemistryFormula.expected))expect(q[k as keyof typeof q]).toBeCloseTo(v,10);});
  it('matches legacy weighted mix denominator behavior',()=>{const result=aggregateWeightedChemistry(fixture.weightedMix.rows);for(const [k,v] of Object.entries(fixture.weightedMix.expectedChemistry))expect(result.chemistry[k as keyof typeof result.chemistry]).toBeCloseTo(v,10);for(const [k,v] of Object.entries(fixture.weightedMix.expectedQuality))expect(result.quality[k as keyof typeof result.quality]).toBeCloseTo(v,10);});
  it('matches legacy Clay vendor/source key lookup',()=>{for(const c of fixture.tonPerRetase)expect(resolveTonPerRetase({materialKind:c.materialKind as 'LS'|'CL',vendor:c.vendor,source:c.source,rules})).toBe(c.expected);});
});
