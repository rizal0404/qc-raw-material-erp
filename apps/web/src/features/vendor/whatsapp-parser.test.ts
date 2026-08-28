import { equipmentSuggestions, suggestedUnitNo, vendorSuggestions } from './master-matching';
import { describe, expect, it } from 'vitest';
import type { MasterLookupResponse } from '@qc/contracts';
import type { EquipmentLookupItem } from './vendor-api';
import { MAX_WHATSAPP_LENGTH, matchCrusher, matchEquipment, matchSource, matchVendor, parseWhatsAppReport } from './whatsapp-parser';

export const topabiring = `*PT. TOPABIRING TRANS LOGISTIC*
*ٱلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ وَبَرَكَاتُهُ*
Shift : 1 (satu)
Selasa:18-08-2026
AM : 4 Unit
AM : 2 Unit Ops
AM : 1 Unit standby
AM: 1 Unit pb
AA : 18 Unit
AA : 11 Unit ops
AA: 3 Unit pb
AA: 4 Unit Stb
1. AM 12 komatsu
AA:.112.116.146
.158.159
Block : 12 Barat
Material :file
Crusher: 5
2.AM 14 komatsu
AA:.115.121.133
.137.156.155
Block: 9 Tengah utara
Material : file
Crusher : 5
Tks... 🙏`;

const annur = `بِسْــــــــــــــمِ اللهِ الرَّحْمَنِ الرَّحِيْـــــم
laporan alat muat & alat angkut
---
PT.AN-NUR ABADI JAYA
---
shift: 1(satu)
selasa,18/08/2026
-total alat muat : 3 unit
operasi : 1 unit
rusak : 2 unit\\
standby : unit
servis : unit
-total alat angkut : 18 unit
operasi : 10 unit
rusak : 4 unit
standby : unit
perbaikan: 4 unit
AM hyundai 07
AA.04.07.08.10.11.12.14.15.16.17
matrial: pile
Blok b.9
LSCR 4/5
tks...!!!`;

const batara = `السلام عليكم ورحمة الله وبركاته
*PT . BATARA INDO PRIMA*
Laporan Alat Muat dan Angkut
*Selasa*
*18/08/2026*
*SHIFT : 1*
*JUMLAH ALAT MUAT : 4 UNIT*
 *Operasi = 2 unit*
 *Rusak = 2 unit*
 *Standby = unit*
*JUMLAH ALAT ANGKUT 19 UNIT*
\\
 *Operasi = 13 unit*
 *Perbaikan = 6 unit*
*Standby = unit*
AM : BX05 Hyundai R480
Blok : B9 tengah
DT : 02 10 12 14 16 17 24
Material : pile
Pelayanan : LSCR 4/5
*Operasi*
AM : BX06 Kobelco SK520
Blok : B12 selatan
DT : 11 15 19 20 22 25
Material : filler
Pelayanan : LSCR 4/5
*Operasi*
Terimakasih 🙏🏼`;

const unnamed = `**ٱلسَّلَامُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ وَبَرَكَاتُهُ**
**selasa, 18/ 08/ 26**
**Shift : 1 (satu)**
**TOTAL PC 5 UNIT**
**OPS** : 3 (unit)
**ST BY** : 1 (unit)
**BD** : 1 (Unit)
**TOTAL DT 24 UNIT**
**OPS** : 14 (unit)
**STB** : 1 (unit)
**DT BD** : 9 (unit)
**1 Proses Asuransi**
**8 Pending Part**
**LOADING AREA**
**AM** : 17
**BLOK** : B 11
**MTRL** : filler
**LSCR** : 5
**No**: 65 66 23 50 29
**AM** : 18
**BLOK** : B 9 tengah
**MTRL** : pile
**LSCR** : 5
**No** : 30 26 25 52
**AM** : 25
**BLOK** : b.9 timur
**MTRL** : pile
**LSCR** : 5
**No**: 28 24 54 56 12`;

describe('WhatsApp vendor reports', () => {
  it('parses Topabiring summaries and multiline AA without swallowing the next AM', () => {
    const parsed = parseWhatsAppReport(topabiring);
    expect(parsed).toMatchObject({ vendor: 'PT. TOPABIRING TRANS LOGISTIC', operationDate: '2026-08-18', shiftCode: 'SHIFT_1', am: { total: 4, operating: 2, standby: 1, repair: 1 }, aa: { total: 18, operating: 11, standby: 4, repair: 3 } });
    expect(parsed.assignments).toEqual([
      { am: '12 komatsu', aa: ['112', '116', '146', '158', '159'], block: '12 Barat', material: 'file', crusher: '5' },
      { am: '14 komatsu', aa: ['115', '121', '133', '137', '156', '155'], block: '9 Tengah utara', material: 'file', crusher: '5' },
    ]);
    expect(parsed.warnings).toContain('Singkatan PB dibaca sebagai perbaikan (Repair). Konfirmasikan arti singkatan vendor.');
  });
  it('parses An-Nur including blank statuses, leading zeros and an unresolved shared destination', () => {
    const parsed = parseWhatsAppReport(annur);
    expect(parsed.am).toEqual({ total: 3, operating: 1, breakdown: 2, repair: 0, standby: 0, other: 0 });
    expect(parsed.aa).toEqual({ total: 18, operating: 10, breakdown: 4, repair: 4, standby: 0, other: 0 });
    expect(parsed.assignments[0]).toEqual({ am: 'hyundai 07', aa: ['04', '07', '08', '10', '11', '12', '14', '15', '16', '17'], block: 'b.9', material: 'pile', crusher: '4/5' });
    expect(parsed.warnings.some(w => w.includes('kosong'))).toBe(true);
  });
  it('parses Batara with model numbers, DT lists and operation flags without recounting the summary', () => {
    const parsed = parseWhatsAppReport(batara.replaceAll(' ', '\u00a0'));
    expect(parsed.vendor).toBe('PT . BATARA INDO PRIMA');
    expect(parsed.am.operating).toBe(2);
    expect(parsed.aa).toMatchObject({ total: 19, operating: 13, repair: 6 });
    expect(parsed.assignments.map(a => [a.am, a.aa.length, a.material, a.crusher])).toEqual([['BX05 Hyundai R480', 7, 'pile', 'LSCR 4/5'], ['BX06 Kobelco SK520', 6, 'filler', 'LSCR 4/5']]);
  });
  it('parses PC/DT, short dates and No lists while keeping the missing vendor explicit', () => {
    const parsed = parseWhatsAppReport(unnamed);
    expect(parsed.vendor).toBe('');
    expect(parsed.operationDate).toBe('2026-08-18');
    expect(parsed.am).toEqual({ total: 5, operating: 3, standby: 1, breakdown: 1, repair: 0, other: 0 });
    expect(parsed.aa.breakdown).toBe(9);
    expect(parsed.assignments.map(a => a.aa.length)).toEqual([5, 4, 5]);
    expect(parsed.warnings.some(w => w.includes('Nama vendor tidak ditemukan'))).toBe(true);
  });
  it.each(['31/02/2026', '18/13/26', '00/08/26'])('does not normalize invalid date %s into another day', date => {
    expect(parseWhatsAppReport(`Shift 2\n${date}`).operationDate).toBe('');
  });
  it('preserves mismatches rather than filling fleet totals from assignment counts', () => {
    const result = parseWhatsAppReport('TOTAL AM 9 UNIT\nOPS: 2 unit\nAM: 01\nAA: 02');
    expect(result.am.total).toBe(9);
    expect(result.am.operating).toBe(2);
    expect(result.warnings.some(w => w.includes('berbeda'))).toBe(true);
  });
  it('detects combined reports and flags duplicates without guessing ranges', () => {
    const result = parseWhatsAppReport('PT. A\n18/08/26\nShift 1\nAM: 01\nAA: 01.01.02-05\nPT. B\n19/08/26\nShift 2');
    expect(result.warnings.filter(w => w.startsWith('Terdeteksi beberapa'))).toHaveLength(3);
    expect(result.assignments[0]?.aa).toEqual(['01', '02-05']);
  });
  it('handles empty and oversized messages safely', () => {
    expect(parseWhatsAppReport('🙏 السلام عليكم').assignments).toEqual([]);
    expect(() => parseWhatsAppReport('x'.repeat(MAX_WHATSAPP_LENGTH + 1))).toThrow('maksimal');
  });
});

function equipment(unitNo: string, id = unitNo, vendorId = 'vendor', type: 'AM' | 'AA' = 'AM'): EquipmentLookupItem { return { id, unitNo, code: unitNo, label: `${unitNo} Hyundai R480`, vendorId, type, active: true }; }
const sources: MasterLookupResponse['sources'] = [{ id: 'source', code: 'B9', label: 'B9 Tengah', block: 'B9 Tengah', materialCategory: 'FILLER', materialKind: 'LS', active: true }];
const crushers: MasterLookupResponse['crushers'] = [4, 5].map(n => ({ id: `${n}`, code: `CR_LS_${n}`, label: `Crusher LS ${n}`, materialKind: 'LS', plantId: null, active: true }));
describe('conservative master matching', () => {
  it('matches units with brand, model, prefix and zero-padding', () => {
    expect(matchEquipment('BX05 Hyundai R480', [equipment('BX05'), equipment('480')], 'vendor', 'AM')).toBe('BX05');
    expect(matchEquipment('hyundai 07', [equipment('AM07')], 'vendor', 'AM')).toBe('AM07');
    expect(matchEquipment('12 komatsu', [equipment('12')], 'vendor', 'AM')).toBe('12');
    expect(matchEquipment('04', [equipment('AA04', 'aa', 'vendor', 'AA')], 'vendor', 'AA')).toBe('aa');
  });
  it('never guesses missing units, ranges, ambiguous units, inactive units or another vendor', () => {
    expect(matchEquipment('999', [equipment('12')], 'vendor', 'AM')).toBe('');
    expect(matchEquipment('02-05', [equipment('02')], 'vendor', 'AM')).toBe('');
    expect(matchEquipment('07', [equipment('AM07'), equipment('PC07')], 'vendor', 'AM')).toBe('');
    expect(matchEquipment('07', [equipment('07', 'a', 'other')], 'vendor', 'AM')).toBe('');
    expect(matchEquipment('07', [{ ...equipment('07'), active: false }], 'vendor', 'AM')).toBe('');
  });
  it('requires exact block direction and category, normalizing file to filler', () => {
    expect(matchSource('b.9 tengah', 'file', sources)).toBe('source');
    expect(matchSource('9 tengah utara', 'file', sources)).toBe('');
    expect(matchSource('B9 Tengah', 'pile', sources)).toBe('');
    expect(matchSource('B9 Tengah', 'file', [...sources, { ...sources[0]!, id: 'duplicate' }])).toBe('');
  });
  it('leaves combined destinations unresolved without collapsing 4/5 into crusher 45', () => {
    expect(matchCrusher('5', crushers)).toBe('5');
    expect(matchCrusher('LSCR 4/5', crushers)).toBe('');
    expect(matchCrusher('LSCR 4/5', [{ ...crushers[0]!, code: 'LSCR45', label: 'LSCR 45' }])).toBe('');
    expect(matchCrusher('', crushers)).toBe('');
    expect(matchCrusher('5', [...crushers, { ...crushers[1]!, id: 'other-plant' }])).toBe('');
  });
  it('matches vendor names without punctuation but not by partial name', () => {
    const vendors: MasterLookupResponse['vendors'] = [{ id: 'batara', code: 'BIP', label: 'PT. BATARA INDO PRIMA', active: true, materialKinds: ['LS'] }];
    expect(matchVendor('PT . BATARA INDO PRIMA', vendors)).toBe('batara');
    expect(matchVendor('BATARA', vendors)).toBe('');
    expect(matchVendor('', vendors)).toBe('');
  });
});

describe('master suggestions for WhatsApp variants', () => {
  const vendors: MasterLookupResponse['vendors'] = [{ id: 'batara', code: 'BIP', label: 'PT. BATARA INDO PRIMA', aliases: ['BATARA GROUP'], active: true, materialKinds: ['LS'] }];
  it('ranks spelling variants without silently picking a fuzzy vendor', () => {
    expect(matchVendor('PT BATARA INDO PRIMAA', vendors)).toBe('');
    expect(vendorSuggestions('PT BATARA INDO PRIMAA', vendors)[0]).toMatchObject({ id: 'batara' });
    expect(vendorSuggestions('PT BATARA INDO PRIMAA', vendors)[0]!.score).toBeLessThan(1);
    expect(matchVendor('BATARA GROUP', vendors)).toBe('batara');
    expect(vendorSuggestions('BIP', vendors)[0]?.score).toBe(1);
    expect(vendorSuggestions('BATARA', vendors.map(v => ({ ...v, active: false })))).toEqual([]);
  });
  it('normalizes AA 11 against 11 and uses aliases within the vendor/type scope only', () => {
    const items = [equipment('11', 'aa11', 'vendor', 'AA'), { ...equipment('BX05'), aliases: ['EX05'] }];
    expect(matchEquipment('AA 11', items, 'vendor', 'AA')).toBe('aa11');
    expect(equipmentSuggestions('AA 011', items, 'vendor', 'AA')[0]).toMatchObject({ id: 'aa11', score: 1 });
    expect(matchEquipment('EX05', items, 'vendor', 'AM')).toBe('BX05');
    expect(equipmentSuggestions('AA 11', items, 'another', 'AA')).toEqual([]);
    expect(equipmentSuggestions('AA 11', items, 'vendor', 'AM')).toEqual([]);
    expect(equipmentSuggestions('AA 12', items, 'vendor', 'AA')).toEqual([]);
    expect(equipmentSuggestions('11-15', items, 'vendor', 'AA')).toEqual([]);
  });
  it('offers conflicting prefixes for explicit review and keeps model numbers out of new units', () => {
    const items = [equipment('BX05')];
    expect(matchEquipment('05', items, 'vendor', 'AM')).toBe('');
    expect(equipmentSuggestions('05', items, 'vendor', 'AM')[0]).toMatchObject({ id: 'BX05', score: 0.85 });
    expect(suggestedUnitNo('BX05 Hyundai R480')).toBe('BX05');
    expect(suggestedUnitNo('AM 07 Komatsu')).toBe('07');
    expect(suggestedUnitNo('AA 11')).toBe('11');
  });
  it('parses repeated AA/DT prefixes as individual unit identifiers', () => {
    expect(parseWhatsAppReport('AM: 01\nAA: AA 11 AA 12 DT 013').assignments[0]?.aa).toEqual(['AA11', 'AA12', 'DT013']);
  });
});
