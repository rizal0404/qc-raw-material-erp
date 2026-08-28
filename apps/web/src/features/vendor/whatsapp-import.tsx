import { useEffect, useMemo, useState } from 'react';
import type { CreateEquipmentRequest, CreateVendorRequest, MasterLookupResponse, ShiftCode } from '@qc/contracts';
import type { EquipmentLookupItem } from './vendor-api';
import { MAX_WHATSAPP_LENGTH, matchCrusher, matchEquipment, matchSource, matchVendor, parseWhatsAppReport, type ParsedVendorReport } from './whatsapp-parser';
import { equipmentSuggestions, suggestedUnitNo, vendorSuggestions } from './master-matching';
import { MasterReferencePicker } from './master-reference-picker';
import './whatsapp-import.css';

export interface ImportAssignment { amId: string; sourceId: string; crusherId: string; blockSnapshot: string; aaIds: string[]; note: string }
export interface WhatsAppImportResult { parsed: ParsedVendorReport; assignments: ImportAssignment[]; note: string }
interface Props {
  vendorId: string; operationDate: string; shiftCode: ShiftCode; materialKind: 'LS' | 'CL';
  lookups: MasterLookupResponse | undefined; amItems: EquipmentLookupItem[]; aaItems: EquipmentLookupItem[];
  onCreateVendor?: (input: CreateVendorRequest) => Promise<string>;
  onCreateEquipment?: (input: CreateEquipmentRequest) => Promise<string>;
  masterPending?: boolean;
  disabled: boolean; onDirty: (dirty: boolean) => void;
  onContext: (context: { vendorId: string; operationDate: string; shiftCode: ShiftCode }) => void;
  onApply: (result: WhatsAppImportResult) => boolean;
}
interface Mapping { amId: string; sourceId: string; crusherId: string; aaIds: string[] }

export function WhatsAppImport(props: Props) {
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedVendorReport | null>(null);
  const [parsedText, setParsedText] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [confirmedVendorId, setConfirmedVendorId] = useState('');
  const [overrides, setOverrides] = useState<Record<number, Mapping>>({});
  const { vendorId, operationDate, shiftCode, materialKind, lookups, amItems, aaItems } = props;
  useEffect(() => { setOverrides({}); setConfirmed(false); }, [vendorId, materialKind, parsed]);
  useEffect(() => { setConfirmed(false); }, [operationDate, shiftCode]);
  const sources = (lookups?.sources ?? []).filter(s => s.active && s.materialKind === materialKind);
  const crushers = (lookups?.crushers ?? []).filter(c => c.active && c.materialKind === materialKind);
  const amOptions = amItems.filter(x => x.active && x.vendorId === vendorId && x.type === 'AM');
  const aaOptions = aaItems.filter(x => x.active && x.vendorId === vendorId && x.type === 'AA');
  const rows = useMemo(() => (parsed?.assignments ?? []).map((a, index) => overrides[index] ?? {
    amId: matchEquipment(a.am, amItems, vendorId, 'AM'),
    sourceId: matchSource(a.block, a.material, (lookups?.sources ?? []).filter(s => s.materialKind === materialKind)),
    crusherId: matchCrusher(a.crusher, (lookups?.crushers ?? []).filter(c => c.materialKind === materialKind)),
    aaIds: a.aa.map(raw => matchEquipment(raw, aaItems, vendorId, 'AA')),
  }), [parsed, overrides, amItems, aaItems, vendorId, lookups, materialKind]);
  const detectedVendor = parsed ? matchVendor(parsed.vendor, lookups?.vendors ?? []) : '';
  const contextMismatch = !!parsed && ((!!parsed.operationDate && parsed.operationDate !== operationDate) || (!!parsed.shiftCode && parsed.shiftCode !== shiftCode) || (!!detectedVendor && detectedVendor !== vendorId && confirmedVendorId !== vendorId));
  const complete = rows.length > 0 && rows.length <= 100 && rows.every(row => amOptions.some(x => x.id === row.amId) && sources.some(x => x.id === row.sourceId) && (!row.crusherId || crushers.some(x => x.id === row.crusherId)) && row.aaIds.length > 0 && row.aaIds.length <= 100 && row.aaIds.every(id => aaOptions.some(x => x.id === id)) && new Set(row.aaIds).size === row.aaIds.length);
  const multiReport = parsed?.warnings.some(w => w.startsWith('Terdeteksi beberapa')) ?? false;
  const stale = text !== parsedText;
  function patch(index: number, next: Partial<Mapping>) { setOverrides(previous => ({ ...previous, [index]: { ...rows[index]!, ...next } })); setConfirmed(false); props.onDirty(true); }
  function parse() {
    try {
      const next = parseWhatsAppReport(text);
      setParsed(next); setConfirmedVendorId(''); setParsedText(text); setConfirmed(false); setError(''); props.onDirty(true);
    } catch (e) { setError(e instanceof Error ? e.message : 'Teks tidak dapat diproses.'); }
  }
  function apply() {
    if (!parsed || !complete || !confirmed || stale || props.disabled || contextMismatch || multiReport) return;
    const applied = props.onApply({ parsed, note: `Sumber: laporan WhatsApp (ditinjau QC).\n--- Teks asli ---\n${parsedText}`, assignments: parsed.assignments.map((a, index) => ({
      ...rows[index]!, blockSnapshot: a.block,
      note: `WhatsApp: AM ${a.am}; AA ${a.aa.join(', ')}; Material ${a.material}; Tujuan ${a.crusher}`.slice(0, 500),
    })) });
    if (applied) { props.onDirty(false); setConfirmed(false); }
  }
  return <div className="wa-import page-stack">
    <div className="card wa-intro"><div><p className="eyebrow">JEMBATAN LAPORAN WAG</p><h2>Tempel laporan, tinjau, lalu simpan</h2><p>Impor satu laporan vendor per proses. Nomor AM/AA dicocokkan hanya ke master vendor terpilih. Teks diproses di browser, tanpa layanan AI eksternal.</p></div><ol><li>Tempel & parsing</li><li>Cocokkan master</li><li>Edit draft & submit</li></ol></div>
    <div className="card wa-input"><label htmlFor="wa-report-text">Teks laporan WhatsApp</label><textarea id="wa-report-text" disabled={props.masterPending} rows={12} maxLength={MAX_WHATSAPP_LENGTH} value={text} onChange={e => { setText(e.target.value); setConfirmed(false); props.onDirty(!!e.target.value); }} placeholder={'Tempel laporan vendor di sini...\nShift: 1\n18/08/2026\nAM: 12 Komatsu\nAA: 112.116.146\nBlok: B12 Barat\nMaterial: filler\nCrusher: 5'} /><div className="inline-actions"><button type="button" className="btn primary" disabled={!text.trim() || props.masterPending} onClick={parse}>Parsing laporan</button><span>{text.length.toLocaleString('id-ID')} / {MAX_WHATSAPP_LENGTH.toLocaleString('id-ID')} karakter</span></div>{error && <p role="alert">{error}</p>}</div>
    {parsed && <>
      <div className="card wa-summary"><div className="section-toolbar"><div><strong>Hasil pembacaan</strong><small>Belum disimpan. Data kosong atau tidak cocok wajib dilengkapi.</small></div><span className="status-badge warning">PRATINJAU</span></div><dl><div><dt>Vendor dalam teks</dt><dd>{parsed.vendor || 'Tidak tercantum — pilih di konteks'}</dd></div><div><dt>Tanggal / shift</dt><dd>{parsed.operationDate || 'Belum dikenali'} · {parsed.shiftCode || 'Belum dikenali'}</dd></div><div><dt>AM / AA operasi</dt><dd>{parsed.am.operating} / {parsed.aa.operating} unit</dd></div><div><dt>Penugasan terbaca</dt><dd>{parsed.assignments.length} route</dd></div></dl>
        <div className="wa-vendor-picker"><MasterReferencePicker kind="Vendor" label="Vendor master untuk laporan" raw={parsed.vendor} value={vendorId} options={(lookups?.vendors ?? []).filter(v => v.active)} suggestions={query => vendorSuggestions(query, lookups?.vendors ?? [])} disabled={props.masterPending} onSelect={id => { setConfirmedVendorId(id); setConfirmed(false); props.onContext({ vendorId: id, operationDate, shiftCode }); }} onCreate={props.onCreateVendor ? input => props.onCreateVendor!({ name: input.name, code: input.code, aliases: parsed.vendor && parsed.vendor.length <= 120 && parsed.vendor !== input.name ? [parsed.vendor] : [], materialKinds: [materialKind] }) : undefined} /></div>
        {contextMismatch && <div className="wa-warning"><p>Tanggal, shift, atau vendor hasil parsing berbeda dari konteks di atas. Gunakan konteks hasil parsing atau koreksi teks sebelum melanjutkan.</p><button className="btn" type="button" disabled={props.masterPending} onClick={() => props.onContext({ vendorId: detectedVendor || vendorId, operationDate: parsed.operationDate || operationDate, shiftCode: parsed.shiftCode || shiftCode })}>Gunakan konteks hasil parsing</button></div>}
        {!!parsed.vendor && !detectedVendor && <p className="wa-warning">Nama vendor tidak cocok secara unik dengan master. Pilih dan konfirmasikan vendor yang benar pada konteks di atas.</p>}
        {parsed.warnings.length > 0 && <div className="wa-warning"><strong>Perlu ditinjau</strong><ul>{parsed.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></div>}
      </div>
      <div className="card assignment-section"><div className="section-toolbar"><div><strong>Cocokkan penugasan dengan master</strong><small>Pilih saran kecocokan atau buat vendor/alat baru langsung ke master. Crusher boleh kosong untuk penugasan lintas crusher; tujuan aktual mengikuti event retase.</small></div></div>
        <div className="assignment-list">{parsed.assignments.map((a, index) => {
          const row = rows[index]!;
          return <article className="assignment-card" key={index}><div className="assignment-head"><strong>#{index + 1} · AM {a.am}</strong><span>{a.aa.length} AA terbaca</span></div><div className="assignment-grid">
            <MasterReferencePicker key={`${vendorId}:am:${index}`} kind="AM" label={`AM penugasan ${index + 1}`} raw={a.am} suggestedUnit={suggestedUnitNo(a.am)} value={row.amId} options={amOptions} suggestions={query => equipmentSuggestions(query, amItems, vendorId, 'AM')} disabled={props.masterPending} onSelect={id => patch(index, { amId: id })} onCreate={vendorId && props.onCreateEquipment ? input => props.onCreateEquipment!({ vendorId, type: 'AM', unitNo: input.unitNo, brand: input.brand || null, aliases: a.am.length <= 120 ? [a.am] : [], materialKinds: [materialKind] }) : undefined} />
            <label><span>Source · {a.block || '?'} / {a.material || '?'}</span><select disabled={props.masterPending} aria-label={`Source penugasan ${index + 1}`} value={row.sourceId} onChange={e => patch(index, { sourceId: e.target.value })}><option value="">— pilih source / material —</option>{sources.map(x => <option key={x.id} value={x.id}>{x.label} · {x.materialCategory}</option>)}</select></label>
            <label><span>Crusher (opsional) · {a.crusher || 'belum ditentukan'}</span><select disabled={props.masterPending} aria-label={`Crusher penugasan ${index + 1}`} value={row.crusherId} onChange={e => patch(index, { crusherId: e.target.value })}><option value="">— lintas crusher / tidak dibatasi —</option>{crushers.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          </div><div className="wa-aa-grid">{a.aa.map((raw, aaIndex) => <MasterReferencePicker key={`${vendorId}:aa:${index}:${aaIndex}`} kind="AA" label={`AA ${raw} penugasan ${index + 1}`} raw={raw} suggestedUnit={suggestedUnitNo(raw)} value={row.aaIds[aaIndex] ?? ''} options={aaOptions.map(x => ({ id: x.id, label: x.unitNo }))} suggestions={query => equipmentSuggestions(query, aaItems, vendorId, 'AA')} disabled={props.masterPending} onSelect={id => patch(index, { aaIds: row.aaIds.map((current, i) => i === aaIndex ? id : current) })} onCreate={vendorId && props.onCreateEquipment ? input => props.onCreateEquipment!({ vendorId, type: 'AA', unitNo: input.unitNo, brand: input.brand || null, aliases: raw.length <= 120 ? [raw] : [], materialKinds: [materialKind] }) : undefined} />)}</div>{new Set(row.aaIds.filter(Boolean)).size !== row.aaIds.filter(Boolean).length && <p className="wa-warning">Satu unit AA dipilih lebih dari sekali. Perbaiki pilihan atau duplikasi di teks.</p>}</article>;
        })}</div>
      </div>
      <div className="card wa-apply">
        {stale && <p role="alert">Teks berubah. Klik Parsing laporan lagi untuk memperbarui pratinjau.</p>}
        {!vendorId && <p>Pilih vendor pada konteks laporan.</p>}
        {!complete && <p>Lengkapi semua AM, Source, dan AA. Crusher bersifat opsional. Koreksi nomor/baris melalui teks lalu parsing ulang bila perlu.</p>}
        {props.disabled && <p>Impor belum dapat diterapkan: tunggu master/konteks selesai dimuat, atau buat revision bila laporan sudah SUBMITTED.</p>}
        <label className="wa-confirm"><input type="checkbox" disabled={props.masterPending} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>Saya sudah memeriksa vendor, tanggal, shift, penugasan, serta peringatan. Ringkasan armada akan saya lengkapi di editor.</span></label>
        <button type="button" className="btn primary" disabled={!complete || !confirmed || !vendorId || !operationDate || props.disabled || contextMismatch || multiReport || stale} onClick={apply}>Terapkan ke editor laporan</button>
        <p>Setelah Save Draft dan Submit, penugasan tersedia untuk pencatatan serta rekonsiliasi retase. Workbench mixing memakai retase aktual yang telah dikonfirmasi QC, bukan jumlah alat.</p>
      </div>
    </>}
  </div>;
}
