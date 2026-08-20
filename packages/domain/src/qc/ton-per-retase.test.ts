import { describe, expect, it } from 'vitest';
import { resolveTonPerRetase, type TonPerRetaseRule } from './ton-per-retase';

const rules: TonPerRetaseRule[] = [
  { id:'pkm-generic', materialKind:'CL', ruleType:'MATCH_KEY', matchKey:'PKM', rate:24, priority:60, active:true },
  { id:'pkm-30', materialKind:'CL', ruleType:'MATCH_KEY', matchKey:'PKM (30 t)', rate:30, priority:110, active:true },
  { id:'default-cl', materialKind:'CL', ruleType:'DEFAULT', matchKey:null, rate:25, priority:1000, active:true },
  { id:'default-ls', materialKind:'LS', ruleType:'DEFAULT', matchKey:null, rate:25, priority:1000, active:true },
];

describe('Ton/Retase legacy ordered matching', () => {
  it('uses Limestone material default', () => {
    expect(resolveTonPerRetase({ materialKind:'LS', vendor:'Any', source:'Any', rules })).toBe(25);
  });
  it('preserves first-match priority for generic PKM before PKM (30 t)', () => {
    expect(resolveTonPerRetase({ materialKind:'CL', vendor:'PKM (30 t)', source:'Pile', rules })).toBe(24);
  });
  it('falls back to Clay default when there is no vendor/source key match', () => {
    expect(resolveTonPerRetase({ materialKind:'CL', vendor:'Unknown', source:'Unknown', rules })).toBe(25);
  });
});
