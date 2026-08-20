import type { MaterialKind, Quality } from '@qc/contracts';

export interface QafRuleSet {
  lsR2O3Max: number;
  lsPileMin: number;
  lsPileMax: number;
  lsFillerMin: number;
  lsFillerMax: number;
  clSmMin: number;
  clSmMax: number;
  clAmMin: number;
  clAmMax: number;
}
export const LEGACY_BASELINE_QAF_RULES: QafRuleSet = {
  lsR2O3Max: 3, lsPileMin: 1100, lsPileMax: 5000, lsFillerMin: 2000, lsFillerMax: 5000,
  clSmMin: 2.3, clSmMax: 2.8, clAmMin: 1.4, clAmMax: 2.0,
};
export type QafStatus = 'OK' | 'CHECK' | 'NO DATA';
export function qafStatus(materialKind: MaterialKind, className: string | null, totalTon: number, quality: Quality, rules: QafRuleSet): QafStatus {
  if (!totalTon) return 'NO DATA';
  if (materialKind === 'CL') {
    return quality.sm !== null && quality.am !== null && quality.sm >= rules.clSmMin && quality.sm <= rules.clSmMax && quality.am >= rules.clAmMin && quality.am <= rules.clAmMax ? 'OK' : 'CHECK';
  }
  const filler = className === 'Filler';
  const min = filler ? rules.lsFillerMin : rules.lsPileMin;
  const max = filler ? rules.lsFillerMax : rules.lsPileMax;
  return quality.lsf !== null && quality.r2o3 !== null && quality.r2o3 <= rules.lsR2O3Max && quality.lsf >= min && quality.lsf <= max ? 'OK' : 'CHECK';
}
export function qafTargetText(materialKind: MaterialKind, className: string | null, rules: QafRuleSet): string {
  if (materialKind === 'CL') return `SM ${rules.clSmMin.toFixed(2)}-${rules.clSmMax.toFixed(2)}; AM ${rules.clAmMin.toFixed(2)}-${rules.clAmMax.toFixed(2)}`;
  const filler = className === 'Filler';
  const min = filler ? rules.lsFillerMin : rules.lsPileMin;
  const max = filler ? rules.lsFillerMax : rules.lsPileMax;
  return `LSF ${Math.round(min)}-${Math.round(max)}; R2O3≤${rules.lsR2O3Max.toFixed(2)}`;
}
