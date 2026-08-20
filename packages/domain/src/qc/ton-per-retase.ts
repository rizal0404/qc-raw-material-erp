import type { MaterialKind } from '@qc/contracts';

export interface TonPerRetaseRule {
  id: string; materialKind: MaterialKind; ruleType: 'DEFAULT' | 'MATCH_KEY'; matchKey: string | null; rate: number; priority: number; active: boolean;
}
function normalize(value: string | null | undefined): string { return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase(); }
export function resolveTonPerRetase(input: { materialKind: MaterialKind; vendor?: string | null; source?: string | null; rules: readonly TonPerRetaseRule[]; fallback?: number }): number {
  const active = input.rules.filter((r) => r.active && r.materialKind === input.materialKind).sort((a,b) => a.priority - b.priority);
  const fallback = active.find((r) => r.ruleType === 'DEFAULT')?.rate ?? input.fallback ?? 25;
  if (input.materialKind === 'LS') return fallback;
  const vendor = normalize(input.vendor), source = normalize(input.source);
  for (const rule of active) {
    if (rule.ruleType !== 'MATCH_KEY' || !rule.matchKey) continue;
    const key = normalize(rule.matchKey);
    if (!key) continue;
    if (vendor === key || source === key || (vendor && vendor.includes(key)) || (source && source.includes(key))) return rule.rate;
  }
  return fallback;
}
