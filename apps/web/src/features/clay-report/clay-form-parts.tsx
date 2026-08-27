import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CreateClayColumnRequestSchema, type CreateClayColumnRequest, type MasterLookupResponse } from '@qc/contracts';
import { nextDisplayOrder, type ClayColumn } from './clay-form-model';

export function Field({ label, unit, hint, children }: { label: string; unit?: string; hint?: string; children: ReactNode }) {
  return <label className="clay-field"><span>{label}</span><div className={unit ? 'clay-input-unit' : undefined}>{children}{unit && <span aria-hidden="true">{unit}</span>}</div>{hint && <small>{hint}</small>}</label>;
}

export function FormSection({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="clay-section"><div className="clay-section-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

export function ClayDialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="clay-dialog clay-page" aria-labelledby={titleId} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <div className="clay-dialog-heading"><h2 id={titleId}>{title}</h2><button type="button" className="clay-icon-button" aria-label="Tutup dialog" disabled={busy} onClick={onClose}>×</button></div>{children}
  </dialog>;
}

export function ColumnDialog({ columns, column, lookup, onSave, onClose }: { columns: ClayColumn[]; column?: ClayColumn; lookup: MasterLookupResponse; onSave: (input: CreateClayColumnRequest) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState({
    mode: column?.inputMode ?? 'MASTER', vendorId: column?.vendorId ?? '', sourceId: column?.sourceId ?? '', pileId: column?.pileId ?? '',
    vendorName: column?.vendorNameSnapshot ?? '', sourceName: column?.sourceNameSnapshot ?? '',
    primary: column?.headerPrimary ?? '', secondary: column?.headerSecondary ?? '', rate: column?.tonPerRetaseSnapshot?.toString() ?? '',
  });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  function update(key: keyof typeof form, value: string) { setForm(x => ({ ...x, [key]: value })); }
  async function save() {
    setError('');
    const parsed = CreateClayColumnRequestSchema.safeParse({
      displayOrder: column?.displayOrder ?? nextDisplayOrder(columns), inputMode: form.mode,
      headerPrimary: form.primary, headerSecondary: form.secondary || null,
      vendorId: form.mode === 'MANUAL' ? null : form.vendorId || null,
      sourceId: form.mode === 'MANUAL' ? null : form.sourceId || null,
      pileId: form.pileId || null, vendorNameSnapshot: form.vendorName || null, sourceNameSnapshot: form.sourceName || null,
      tonPerRetaseSnapshot: form.rate.trim() === '' ? null : Number(form.rate.replace(',', '.')),
    });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Periksa isian material.'); return; }
    setBusy(true);
    try { await onSave(parsed.data); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Material gagal disimpan.'); } finally { setBusy(false); }
  }
  return <ClayDialog title={column ? 'Ubah kolom material' : 'Tambah kolom material'} onClose={onClose} busy={busy}>
    <form onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="clay-help">Satu kolom mewakili vendor atau lokasi pengambilan. Nama di laporan boleh mengikuti tulisan pada form kertas.</p>
      <fieldset disabled={busy} className="clay-fieldset"><div className="clay-fields">
        <Field label="Cara mengisi"><select value={form.mode} onChange={e => update('mode', e.target.value)}><option value="MASTER">Pilih dari daftar</option><option value="MANUAL">Tulis nama sendiri</option><option value="BUFFER">Buffer / area penyimpanan</option></select></Field>
        <Field label="Judul kolom *"><input required maxLength={160} placeholder="Contoh: TOP atau BUFFER" value={form.primary} onChange={e => update('primary', e.target.value)} /></Field>
        <Field label="Baris kedua judul"><input maxLength={160} placeholder="Contoh: BONTOA atau TRASS" value={form.secondary} onChange={e => update('secondary', e.target.value)} /></Field>
        {form.mode !== 'MANUAL' ? <>
          <Field label="Vendor"><select value={form.vendorId} onChange={e => { update('vendorId', e.target.value); const item = lookup.vendors.find(x => x.id === e.target.value); if (item && !form.primary) update('primary', item.label); }}><option value="">Tanpa vendor</option>{lookup.vendors.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
          <Field label="Sumber / lokasi"><select value={form.sourceId} onChange={e => { update('sourceId', e.target.value); const item = lookup.sources.find(x => x.id === e.target.value); if (item && !form.primary) update('primary', item.label); }}><option value="">Tanpa sumber master</option>{lookup.sources.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
        </> : <>
          <Field label="Nama vendor manual"><input maxLength={160} value={form.vendorName} onChange={e => update('vendorName', e.target.value)} /></Field>
          <Field label="Nama sumber manual"><input maxLength={160} value={form.sourceName} onChange={e => update('sourceName', e.target.value)} /></Field>
        </>}
        <Field label="Pile tujuan (opsional)"><select value={form.pileId} onChange={e => update('pileId', e.target.value)}><option value="">Belum ditentukan</option>{lookup.piles.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
        <Field label="Berat per trip (opsional)" unit="ton/trip"><input inputMode="decimal" value={form.rate} onChange={e => update('rate', e.target.value)} /></Field>
      </div></fieldset>
      <p className="clay-help">Nama manual hanya disimpan dalam laporan ini; tidak membuat master baru.</p>
      {error && <p role="alert" className="clay-message error">{error}</p>}
      <div className="clay-dialog-actions"><button type="button" className="btn" onClick={onClose} disabled={busy}>Batal</button><button className="btn primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan material'}</button></div>
    </form>
  </ClayDialog>;
}
