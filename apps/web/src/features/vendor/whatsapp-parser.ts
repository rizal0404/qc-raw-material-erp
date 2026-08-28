import type { FleetSummary, MasterLookupResponse, ShiftCode } from '@qc/contracts';
import type { EquipmentLookupItem } from './vendor-api';
import { normalizedName } from './master-matching';

export const MAX_WHATSAPP_LENGTH = 18_000;
export interface ParsedAssignment {
  am: string;
  aa: string[];
  block: string;
  material: string;
  crusher: string;
}
export interface ParsedVendorReport {
  vendor: string;
  operationDate: string;
  shiftCode: ShiftCode | '';
  am: FleetSummary;
  aa: FleetSummary;
  assignments: ParsedAssignment[];
  warnings: string[];
}

const emptyFleet = (): FleetSummary => ({ total: 0, operating: 0, standby: 0, breakdown: 0, repair: 0, other: 0 });
const normalize = (text: string) => text.toUpperCase().replace(/[^A-Z0-9]/g, '');
const unique = (values: string[]) => [...new Set(values)];
const statusKey = (line: string): keyof FleetSummary | undefined => {
  if (/\b(?:ops?|operasi|operating|operasional)\b/i.test(line)) return 'operating';
  if (/\b(?:stand\s*by|st\s*by|stb)\b/i.test(line)) return 'standby';
  if (/\b(?:rusak|bd|break\s*down)\b/i.test(line)) return 'breakdown';
  if (/\b(?:pb|perbaikan|repair|servis|service)\b/i.test(line)) return 'repair';
  if (/\b(?:other|lain(?:nya)?)\b/i.test(line)) return 'other';
  return undefined;
};

/** Local, deterministic extraction. Uncertain references are resolved by a human, never invented. */
export function parseWhatsAppReport(text: string): ParsedVendorReport {
  const result: ParsedVendorReport = { vendor: '', operationDate: '', shiftCode: '', am: emptyFleet(), aa: emptyFleet(), assignments: [], warnings: [] };
  if (text.length > MAX_WHATSAPP_LENGTH) throw new Error(`Teks maksimal ${MAX_WHATSAPP_LENGTH.toLocaleString('id-ID')} karakter. Impor satu laporan vendor setiap kali.`);
  const lines = text.replace(/[\u00a0\u2000-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/[*_`\\]/g, '').split(/\r?\n/).map(line => line.trim().replace(/^[-•]\s*/, '').replace(/^\d+\s*[.)]\s*(?=(?:AM|PC)\b)/i, '').replace(/\s+/g, ' ')).filter(Boolean);
  let fleet: 'am' | 'aa' | undefined;
  let assignment: ParsedAssignment | undefined;
  let continuingAa = false;
  const seen = { am: new Set<string>(), aa: new Set<string>() };

  for (const line of lines) {
    if (/^PT\s*\.?\s*\S/i.test(line)) {
      if (result.vendor && normalize(result.vendor) !== normalize(line)) result.warnings.push('Terdeteksi beberapa vendor. Pisahkan menjadi satu laporan per impor.');
      else result.vendor = line;
      continue;
    }
    const date = line.match(/\b(\d{1,2})\s*[-/]\s*(\d{1,2})\s*[-/]\s*(\d{4}|\d{2})\b/);
    if (date) {
      const year = date[3]!.length === 2 ? `20${date[3]}` : date[3]!;
      const iso = `${year}-${date[2]!.padStart(2, '0')}-${date[1]!.padStart(2, '0')}`;
      const value = new Date(`${iso}T00:00:00Z`);
      if (!Number.isNaN(value.valueOf()) && value.toISOString().slice(0, 10) === iso) {
        if (result.operationDate && result.operationDate !== iso) result.warnings.push('Terdeteksi beberapa tanggal. Pisahkan laporan sebelum impor.');
        else result.operationDate = iso;
      } else result.warnings.push(`Tanggal tidak valid: ${date[0]}.`);
      continue;
    }
    const shift = line.match(/\bshift\s*[:=.-]?\s*([123]|satu|dua|tiga)\b/i);
    if (shift) {
      const number = ({ satu: '1', dua: '2', tiga: '3' } as Record<string, string>)[shift[1]!.toLowerCase()] ?? shift[1];
      const code = `SHIFT_${number}` as ShiftCode;
      if (result.shiftCode && result.shiftCode !== code) result.warnings.push('Terdeteksi beberapa shift. Pisahkan laporan sebelum impor.');
      else result.shiftCode = code;
      continue;
    }
    const heading = line.match(/^(?:total|jumlah)\s+(?:alat\s+)?(muat|angkut|AM|AA|PC|DT)\b/i);
    const shorthand = line.match(/^(AM|AA|PC|DT)\s*[:=]?\s*\d+\s*\(?\s*unit\b/i);
    if (heading || shorthand) {
      const kind = (heading?.[1] ?? shorthand?.[1] ?? '').toLowerCase();
      fleet = ['muat', 'am', 'pc'].includes(kind) ? 'am' : 'aa';
      assignment = undefined;
      continuingAa = false;
      const key = heading ? 'total' : statusKey(line) ?? 'total';
      const count = line.match(/\d+/);
      if (seen[fleet].has(key)) result.warnings.push(`${fleet.toUpperCase()}: status ${key} berulang; nilai terakhir digunakan, periksa kembali.`);
      result[fleet][key] = count ? Number(count[0]) : 0;
      seen[fleet].add(key);
      continue;
    }
    const status = statusKey(line);
    if (fleet && !assignment && status && /^(?:(?:AM|AA|PC|DT)\s+)?(?:ops?|operasi|operating|operasional|stand\s*by|st\s*by|stb|rusak|bd|break\s*down|pb|perbaikan|repair|servis|service|other|lain)/i.test(line)) {
      const count = line.match(/\d+/);
      if (!count) result.warnings.push(`${fleet.toUpperCase()}: angka ${line.split(/[:=]/)[0]} kosong, sementara diisi 0.`);
      // Servis and perbaikan may both be present: both are repair, not replacements.
      if (seen[fleet].has(status)) result.warnings.push(`${fleet.toUpperCase()}: beberapa baris ${status} dijumlahkan; periksa kemungkinan duplikasi.`);
      result[fleet][status] += count ? Number(count[0]) : 0;
      seen[fleet].add(status);
      continue;
    }
    const am = line.match(/^(?:AM|PC)\b\s*[:=.-]?\s*(.+)$/i);
    if (am) {
      assignment = { am: am[1]!.trim(), aa: [], block: '', material: '', crusher: '' };
      result.assignments.push(assignment);
      fleet = undefined;
      continuingAa = false;
      continue;
    }
    if (!assignment) continue;
    const aa = line.match(/^(?:AA|DT|NO(?:MOR)?)\b\s*[:=.]?\s*(.*)$/i);
    if (aa || (continuingAa && /^[.\s,;\d/\-]+$/.test(line) && /\d/.test(line))) {
      const tokens = (aa?.[1] ?? line).replace(/\b(AA|DT)\s*[:.-]?\s*(?=\d)/gi, '$1').split(/[\s.,;/]+/).filter(Boolean);
      const duplicates = tokens.filter(token => assignment!.aa.includes(token));
      if (duplicates.length || new Set(tokens).size < tokens.length) result.warnings.push(`AM ${assignment.am}: nomor AA berulang telah digabung.`);
      assignment.aa = unique([...assignment.aa, ...tokens]);
      continuingAa = true;
      continue;
    }
    continuingAa = false;
    const block = line.match(/^(?:block|blok)\b\s*[:=]?\s*(.*)$/i);
    const material = line.match(/^(?:material|matrial|mtrl|materil)\b\s*[:=]?\s*(.*)$/i);
    const crusher = line.match(/^(?:crusher|lscr|pelayanan|tujuan)\b\s*[:=]?\s*(.*)$/i);
    if (block) assignment.block = block[1]!.trim();
    else if (material) assignment.material = material[1]!.trim();
    else if (crusher) assignment.crusher = crusher[1]!.trim();
  }
  if (!result.vendor) result.warnings.push('Nama vendor tidak ditemukan. Pilih vendor pada konteks laporan.');
  if (!result.operationDate) result.warnings.push('Tanggal belum dikenali. Lengkapi tanggal operasi.');
  if (!result.shiftCode) result.warnings.push('Shift belum dikenali. Lengkapi shift.');
  for (const kind of ['am', 'aa'] as const) {
    if (!seen[kind].has('total')) result.warnings.push(`Total ${kind.toUpperCase()} tidak ditemukan; lengkapi ringkasan armada.`);
    const summary = result[kind];
    const sum = summary.operating + summary.standby + summary.breakdown + summary.repair + summary.other;
    if (summary.total !== sum) result.warnings.push(`${kind.toUpperCase()}: total ${summary.total} berbeda dengan jumlah status ${sum}.`);
    const assigned = kind === 'am' ? unique(result.assignments.map(a => normalize(a.am))).length : unique(result.assignments.flatMap(a => a.aa).map(normalize)).length;
    if (summary.operating !== assigned) result.warnings.push(`${kind.toUpperCase()}: operasi ${summary.operating}, rincian penugasan ${assigned} unit. Periksa kelengkapannya.`);
  }
  if (!result.assignments.length) result.warnings.push('Tidak ada penugasan AM yang dikenali. Perbaiki teks atau tambahkan assignment secara manual.');
  if (result.assignments.some(a => /\d\s*[/&,]\s*\d/.test(a.crusher))) result.warnings.push('Tujuan crusher gabungan (misalnya 4/5): boleh kosong untuk lintas crusher, atau pilih tujuan spesifik bila sudah pasti.');
  if (/\bpb\b/i.test(text)) result.warnings.push('Singkatan PB dibaca sebagai perbaikan (Repair). Konfirmasikan arti singkatan vendor.');
  return result;
}

export function matchVendor(name: string, vendors: MasterLookupResponse['vendors']): string {
  const key = normalizedName(name);
  if (!key) return '';
  const matches = vendors.filter(v => v.active && [v.label, v.code, ...(v.aliases ?? [])].some(value => normalizedName(value) === key));
  return matches.length === 1 ? matches[0]!.id : '';
}

const unitKey = (value: string) => normalize(value).replace(/^(?:AM|AA|PC|DT)(?=\d)/, '').replace(/(^|[A-Z])0+(?=\d)/g, '$1');
export function matchEquipment(raw: string, items: EquipmentLookupItem[], vendorId: string, type: 'AM' | 'AA'): string {
  if (/\d\s*[-/&,]\s*\d/.test(raw)) return ''; // A range/list is not a single unit.
  const candidates = items.filter(item => item.active && item.vendorId === vendorId && item.type === type);
  const exact = candidates.filter(item => [item.unitNo, item.code, item.label, ...(item.aliases ?? [])].some(value => normalize(value) === normalize(raw)));
  if (exact.length) return exact.length === 1 ? exact[0]!.id : '';
  // Prefer BX05 or AM12 over model identifiers (R480/SK520); otherwise use a standalone unit number.
  const tokens = raw.toUpperCase().match(/\b(?:(?:BX|AM|AA|PC|DT)\s*\d+|\d+)\b/g) ?? [];
  const prefixed = tokens.filter(value => /[A-Z]/.test(value));
  const token = prefixed.length === 1 ? prefixed[0] : tokens.length === 1 ? tokens[0] : undefined;
  if (!token) return '';
  const matches = candidates.filter(item => [item.unitNo, ...(item.aliases ?? [])].some(value => unitKey(value) === unitKey(token)));
  return matches.length === 1 ? matches[0]!.id : '';
}

const blockKey = (value: string) => normalize(value).replace(/^(?:BLOCK|BLOK)/, '').replace(/^B(?=\d)/, '').replace(/^0+(?=\d)/, '');
const categoryKey = (value: string) => /^(?:file|filer|filler)$/i.test(value.trim()) ? 'FILLER' : normalize(value);
export function matchSource(block: string, material: string, sources: MasterLookupResponse['sources']): string {
  if (!block || !material) return '';
  const matches = sources.filter(source => source.active && categoryKey(source.materialCategory) === categoryKey(material) && [source.block ?? '', source.label, source.code].some(value => blockKey(value) === blockKey(block)));
  return matches.length === 1 ? matches[0]!.id : '';
}

export function matchCrusher(raw: string, crushers: MasterLookupResponse['crushers']): string {
  const numbers = raw.match(/\d+/g) ?? [];
  // Do not collapse 4/5 into 45 when comparing punctuation-free master codes.
  if (numbers.length > 1) return '';
  const active = crushers.filter(c => c.active);
  const exact = active.filter(c => [c.code, c.label].some(value => normalize(value) === normalize(raw)));
  if (exact.length) return exact.length === 1 ? exact[0]!.id : '';
  if (numbers.length !== 1) return '';
  const matches = active.filter(c => [c.code, c.label].some(value => { const nums = value.match(/\d+/g); return nums?.length === 1 && Number(nums[0]) === Number(numbers[0]); }));
  return matches.length === 1 ? matches[0]!.id : '';
}
