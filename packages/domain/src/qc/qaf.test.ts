import { describe, expect, it } from 'vitest';
import { LEGACY_BASELINE_QAF_RULES, qafStatus } from './qaf';
describe('QAF legacy baseline', () => {
  it('returns NO DATA when tonnage is zero', () => expect(qafStatus('LS','Filler',0,{lsf:null,sm:null,am:null,naeq:null,r2o3:null},LEGACY_BASELINE_QAF_RULES)).toBe('NO DATA'));
  it('evaluates clay SM and AM bounds', () => expect(qafStatus('CL','Utara',10,{lsf:null,sm:2.5,am:1.6,naeq:null,r2o3:null},LEGACY_BASELINE_QAF_RULES)).toBe('OK'));
});
