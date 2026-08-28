import { useEffect, useState } from 'react';
import { Modal } from '../../components/modal';
import type { MatchSuggestion } from './master-matching';

export interface NewReference { name: string; code: string; unitNo: string; brand: string }
interface Props {
  label: string; kind: 'Vendor' | 'AM' | 'AA'; value: string; raw: string; suggestedUnit?: string;
  options: Array<{ id: string; label: string }>;
  suggestions: (query: string) => MatchSuggestion[];
  onSelect: (id: string) => void;
  onCreate?: ((input: NewReference) => Promise<string>) | undefined;
  disabled?: boolean | undefined;
}

export function MasterReferencePicker({ label, kind, value, raw, options, suggestions, onSelect, onCreate, suggestedUnit, disabled = false }: Props) {
  const [search, setSearch] = useState(raw);
  const [form, setForm] = useState<NewReference | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setSearch(raw); }, [raw]);
  const matches = suggestions(search);
  async function create() {
    if (!form || !onCreate || saving) return;
    setSaving(true); setError('');
    try { const id = await onCreate(form); onSelect(id); setForm(null); }
    catch (e) { setError(e instanceof Error ? e.message : 'Master gagal disimpan.'); }
    finally { setSaving(false); }
  }
  return <div className="wa-reference">
    <label><span>{label}</span><select aria-label={label} value={value} disabled={disabled || saving} onChange={e => onSelect(e.target.value)}><option value="">— pilih dari master —</option>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    <details open={!value || undefined}><summary>{value ? 'Cari alternatif / tambah' : 'Cari kecocokan / tambah master'}</summary>
      <input aria-label={`Cari ${label}`} value={search} onChange={e => setSearch(e.target.value)} placeholder={`Cari ${kind} di master`} disabled={disabled || saving} />
      <div className="wa-match-list">{matches.map(match => <button className="btn small" type="button" key={match.id} disabled={disabled || saving} onClick={() => onSelect(match.id)} title={match.reason}>Gunakan {match.label} · {Math.round(match.score * 100)}%</button>)}{!matches.length && <small>Belum ada kecocokan. Periksa daftar master sebelum membuat data baru.</small>}</div>
      {onCreate && <button type="button" className="btn small" disabled={disabled || saving} onClick={() => { setError(''); setForm({ name: raw.trim(), code: raw.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64), unitNo: suggestedUnit ?? raw, brand: '' }); }}>+ Tambah {kind} ke master</button>}
    </details>
    {form && <Modal title={`Tambah ${kind} ke Master Data`} subtitle="Data disimpan langsung ke master setelah Anda menekan Simpan. Pastikan bukan duplikat." onClose={() => { if (!saving) setForm(null); }} footer={<><button className="btn" type="button" disabled={saving} onClick={() => setForm(null)}>Batal</button><button className="btn primary" type="button" disabled={saving || (kind === 'Vendor' ? !form.code.trim() || form.name.trim().length < 2 : !form.unitNo.trim())} onClick={() => void create()}>{saving ? 'Menyimpan...' : 'Simpan master & gunakan'}</button></>}>
      <div className="assignment-grid">{kind === 'Vendor' ? <><label><span>Nama vendor baru</span><input autoFocus maxLength={160} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={saving} /></label><label><span>Kode vendor baru</span><input maxLength={64} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} disabled={saving} /></label></> : <><label><span>Nomor {kind} baru</span><input autoFocus maxLength={64} value={form.unitNo} onChange={e => setForm({ ...form, unitNo: e.target.value })} disabled={saving} /></label><label><span>Merek (opsional)</span><input maxLength={120} value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} disabled={saving} /></label></>}</div>
      <p>Nomor alat disimpan untuk vendor dan material pada konteks laporan ini. Kesalahan atau duplikasi tidak akan membuat data baru secara otomatis.</p>
      {error && <p className="wa-warning" role="alert">{error}</p>}
    </Modal>}
  </div>;
}
