import type { MasterLookupResponse } from '@qc/contracts';
import type { EquipmentLookupItem } from './vendor-api';

export interface MatchSuggestion { id: string; label: string; score: number; reason: string }
export const normalizedName = (text: string) => text.toUpperCase().replace(/^[\s*]*(?:PT|CV)\b[\s.]*/i, '').replace(/[^A-Z0-9]/g, '');
export const normalizedUnit = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(?:AM|AA|PC|DT)(?=\d)/, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1');

/** Edit-distance suggestions are advisory only; never automatically select a fuzzy match. */
function similarity(left: string, right: string): number {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const row = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i++) {
    let previous = row[0]!; row[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const diagonal = previous; previous = row[j]!;
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
  }
  return 1 - row[right.length]! / Math.max(left.length, right.length);
}
export function vendorSuggestions(raw: string, vendors: MasterLookupResponse['vendors']): MatchSuggestion[] {
  const key = normalizedName(raw);
  return vendors.filter(v => v.active).map(v => {
    const names = [v.label, v.code, ...(v.aliases ?? [])].map(normalizedName);
    const score = Math.max(...names.map(name => Math.max(similarity(key, name), key.length >= 4 && (name.includes(key) || key.includes(name)) ? 0.8 : 0)));
    return { id: v.id, label: v.label, score, reason: score === 1 ? 'Nama / kode / alias cocok' : 'Nama mirip — perlu konfirmasi' };
  }).filter(x => x.score >= 0.45).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label)).slice(0, 6);
}

export function suggestedUnitNo(raw: string): string {
  if (/\d\s*[-/&,]\s*\d/.test(raw)) return raw.trim();
  const tokens = raw.toUpperCase().match(/\b(?:(?:BX|AM|AA|PC|DT)[\s.-]*\d+|\d+)\b/g) ?? [];
  const prefixed = tokens.filter(t => /[A-Z]/.test(t));
  const token = prefixed.length === 1 ? prefixed[0] : tokens.length === 1 ? tokens[0] : undefined;
  return token ? token.replace(/^(AM|AA|PC|DT)[\s.-]*/i, '').replace(/\s+/g, '') : raw.trim();
}
export function equipmentSuggestions(raw: string, items: EquipmentLookupItem[], vendorId: string, type: 'AM' | 'AA'): MatchSuggestion[] {
  if (/\d\s*[-/&,]\s*\d/.test(raw)) return [];
  const key = normalizedUnit(suggestedUnitNo(raw));
  const digits = key.match(/\d+/g)?.join('');
  return items.filter(v => v.active && v.vendorId === vendorId && v.type === type).map(v => {
    const aliases = [v.unitNo, ...(v.aliases ?? [])].map(normalizedUnit);
    const exact = aliases.includes(key);
    const sameNumber = digits && aliases.some(alias => alias.match(/\d+/g)?.join('') === digits);
    const score = exact ? 1 : sameNumber ? 0.85 : 0;
    return { id: v.id, label: v.label, score, reason: exact ? 'Nomor / prefiks / alias cocok' : 'Angka sama, kode berbeda — perlu konfirmasi' };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
}
