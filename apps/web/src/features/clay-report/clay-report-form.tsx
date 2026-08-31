import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useBlocker } from '@tanstack/react-router';
import type { ClayReport, ClayReportContext, MasterLookupResponse, Role, ShiftCode } from '@qc/contracts';
import { approveClay, createClayColumn, reopenClay, submitClay, updateClayColumn } from './clay-report-api';
import { cellKey, columnLabel, currentShiftContext, downtimeMinutes, formatDate, formatNumber, formatTime, shiftHours, shiftLabel, shiftWindow, type ClayColumn, type HeaderDraft } from './clay-form-model';
import { ClayDialog, ColumnDialog, Field, FormSection } from './clay-form-parts';
import { useClayDraft } from './use-clay-draft';
import './clay-report.css';

const tabs = ['Ringkasan', 'Distribusi Material', 'Gangguan & Catatan'];
const statusLabels: Record<ClayReport['status'], string> = { DRAFT: 'Draft', SUBMITTED: 'Menunggu persetujuan', APPROVED: 'Disetujui', SUPERSEDED: 'Versi terdahulu' };
const categories: Record<string, string> = { BREAKDOWN: 'Mekanik', STOP: 'Operasional', MAINTENANCE: 'Perawatan', NOTE: 'Catatan umum', SHIFT_CHANGE: 'Pergantian shift' };

export function ClayHeading({ unit, date, shift, status, children }: { unit: string; date: string; shift: string; status?: ClayReport['status']; children?: ReactNode }) {
  return <header className="clay-heading"><div><p className="clay-eyebrow">Operasional <span>·</span> {unit || 'Clay Crusher'}</p><h1>Laporan Harian Crusher</h1><p className="clay-subtitle">{formatDate(date)} <span>·</span> {shiftLabel(shift)}</p></div><div className="clay-heading-meta"><span className={`clay-state ${(status ?? 'DRAFT').toLowerCase()}`}><span aria-hidden="true">●</span> {status ? statusLabels[status] : 'Belum dibuat'}</span>{children}</div></header>;
}

export function ContextFields({ context, lookup, onChange, disabled = false, operator }: { context: ClayReportContext; lookup: MasterLookupResponse; onChange: (context: ClayReportContext) => void; disabled?: boolean; operator?: ReactNode }) {
  return <div className="clay-fields">
    <Field label="Tanggal operasi"><input type="date" value={context.operationDate} disabled={disabled} onInput={e => { if (e.currentTarget.value) onChange({ ...context, operationDate: e.currentTarget.value }); }} /></Field>
    <Field label="Shift"><select value={context.shiftCode} disabled={disabled} onChange={e => onChange({ ...context, shiftCode: e.target.value })}>{lookup.shifts.map(x => <option key={x.code} value={x.code}>{shiftLabel(x.code)} · {x.startTime.slice(0, 5)}–{x.endTime.slice(0, 5)}</option>)}</select></Field>
    {operator}
    <Field label="Unit / Area"><select value={context.crusherId} disabled={disabled} onChange={e => onChange({ ...context, crusherId: e.target.value })}><option value="">Pilih Clay Crusher</option>{lookup.crushers.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}</select></Field>
  </div>;
}

export function ClayReportForm({ report, lookup, role, onReport, onContextChange, modeNavigation }: { report: ClayReport; lookup: MasterLookupResponse; role: Role; onReport: (report: ClayReport) => void; onContextChange: (context: ClayReportContext) => void; modeNavigation?: ReactNode }) {
  const qc = role === 'QC_ANALYST' || role === 'SUPERVISOR_ADMIN', operator = role === 'CRUSHER_OPERATOR';
  const editable = report.status === 'DRAFT';
  const draft = useClayDraft(report, qc, onReport);
  const [tab, setTab] = useState(0), [editMode, setEditMode] = useState<1 | -1>(1);
  const [columnDialog, setColumnDialog] = useState<ClayColumn | 'new' | null>(null);
  const [workflow, setWorkflow] = useState<'submit' | 'approve' | 'reopen' | null>(null);
  const [workflowReason, setWorkflowReason] = useState('');
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => { const interval = window.setInterval(() => setClock(new Date()), 30_000); return () => window.clearInterval(interval); }, []);
  const blocker = useBlocker({ shouldBlockFn: () => draft.dirty || !!draft.busy, enableBeforeUnload: draft.dirty || !!draft.busy, withResolver: true });
  const shift = lookup.shifts.find(x => x.code === report.shiftCode);
  const live = currentShiftContext(lookup.shifts, clock);
  const currentContext = live.operationDate === report.operationDate && live.shiftCode === report.shiftCode;
  const activeColumns = report.columns.filter(x => x.status !== 'INACTIVE').sort((a, b) => a.displayOrder - b.displayOrder);
  const allRows = useMemo(() => {
    if (!shift) return report.hourly.map(x => ({ hour: x.hour, eventAt: '', nextDay: false })).filter((x, i, rows) => rows.findIndex(r => r.hour === x.hour) === i);
    const rows = shiftHours(report.operationDate, shift);
    // Preserve visibility of older out-of-shift entries; they are not editable here.
    for (const cell of report.hourly) if (!rows.some(x => x.hour === cell.hour)) rows.push({ hour: cell.hour, eventAt: '', nextDay: false });
    return rows;
  }, [report.operationDate, report.hourly, shift]);
  const countAt = (id: string, hour: string) => (report.hourly.find(x => x.columnId === id && x.hour === hour)?.retase ?? 0) + (draft.cells[cellKey(id, hour)]?.delta ?? 0);
  const totals = report.columns.map(column => ({ column, count: allRows.reduce((sum, row) => sum + countAt(column.id, row.hour), 0) }));
  const total = totals.reduce((sum, x) => sum + x.count, 0);
  const dominant = totals.filter(x => x.count > 0).sort((a, b) => b.count - a.count);
  const dominantNames = dominant.length ? dominant.filter(x => x.count === dominant[0]!.count).map(x => columnLabel(x.column)).join(', ') : 'Belum ada trip';
  const hiddenTripTotal = totals.filter(x => x.column.status === 'INACTIVE').reduce((sum, x) => sum + x.count, 0);
  const downtime = shift ? downtimeMinutes([...report.operationLogs, ...draft.logs], shift) : null;
  const shiftMinutes = shift ? shiftWindow(shift).minutes : null;
  const running = draft.header.runningMinutes.trim() === '' ? null : Number(draft.header.runningMinutes.replace(',', '.'));
  const utilization = running !== null && shiftMinutes ? running / shiftMinutes * 100 : null;
  const production = Number(draft.header.productionTonnage.replace(',', '.')), capacity = Number(draft.header.capacityTph.replace(',', '.'));
  const efficiency = draft.header.productionTonnage !== '' && capacity > 0 && running !== null && running > 0 ? production / capacity / (running / 60) * 100 : null;
  const pendingCells = Object.keys(draft.cells).length;
  const canChangeGrid = editable && !draft.busy && !draft.retryRequired && !draft.liveRetry;
  const summaryLocked = !qc || !editable || (!!draft.busy && draft.busy !== 'Menyimpan header');
  const provisional = report.columns.filter(x => x.status === 'PROVISIONAL').length;

  function setHeader(key: keyof HeaderDraft, value: string) { draft.setHeader(x => ({ ...x, [key]: value })); }
  function contextChange(next: ClayReportContext) {
    if (draft.busy) return;
    if (draft.dirty && !window.confirm('Ada perubahan belum tersimpan. Tinggalkan perubahan dan buka konteks lain?')) return;
    onContextChange(next);
  }
  function step(index: number) { setTab(index); document.getElementById('clay-form-start')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  async function saveDraft() { await draft.perform('Menyimpan draft', async () => { await draft.persistAll(); }); }
  async function performWorkflow() {
    const success = await draft.perform(workflow === 'submit' ? 'Mengirim laporan' : workflow === 'approve' ? 'Menyetujui laporan' : 'Membuka laporan', async () => {
      if (workflow === 'submit') {
        const saved = await draft.persistAll();
        if (!saved.columns.some(x => x.status === 'CONFIRMED')) throw new Error('Tambahkan sedikitnya satu material terkonfirmasi sebelum submit.');
        if (saved.columns.some(x => x.status === 'PROVISIONAL')) throw new Error('Konfirmasi seluruh material baru pada tab Distribusi Material sebelum submit.');
        draft.commit((await submitClay(report.id)).report);
      } else if (workflow === 'approve') draft.commit((await approveClay(report.id)).report);
      else if (workflow === 'reopen') draft.commit((await reopenClay(report.id, workflowReason)).report);
    });
    if (success) setWorkflow(null);
  }
  function numberField(key: keyof HeaderDraft, label: string, unit: string, hint?: string) {
    return <Field label={label} unit={unit} {...(hint ? { hint } : {})}><input inputMode="decimal" value={draft.header[key]} disabled={summaryLocked} onChange={e => setHeader(key, e.target.value)} /></Field>;
  }

  return <div className="clay-page" id="clay-form-start">
    <ClayHeading unit={report.crusherName} date={report.operationDate} shift={report.shiftCode} status={report.status}><span className="clay-autosave">{draft.busy || (draft.dirty ? 'Ada perubahan belum tersimpan' : `Tersimpan · ${formatTime(draft.savedAt)} WITA`)}</span></ClayHeading>
    {modeNavigation}
    <div className="clay-tabs" role="tablist" aria-label="Bagian laporan Clay">{tabs.map((title, index) => <button key={title} id={`clay-tab-${index}`} type="button" role="tab" aria-selected={tab === index} aria-controls={`clay-panel-${index}`} tabIndex={tab === index ? 0 : -1} onClick={() => setTab(index)} onKeyDown={e => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault(); const next = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (tab + (e.key === 'ArrowRight' ? 1 : 2)) % 3; setTab(next); document.getElementById(`clay-tab-${next}`)?.focus();
    }}><span className="clay-step">{index + 1}</span><span>{title}</span>{index === 1 && pendingCells > 0 && <i aria-label={`${pendingCells} sel belum tersimpan`}>●</i>}{index === 2 && draft.logs.length > 0 && <i aria-label="Gangguan belum tersimpan">●</i>}</button>)}</div>
    {draft.error && <div className="clay-message error" role="alert">{draft.error}{draft.retryRequired && <p>Perubahan trip dikunci sementara. Tekan Simpan Draft untuk mengirim ulang dengan ID yang sama.</p>}</div>}
    {draft.liveRetry && <div className="clay-message warning" role="alert">Trip live belum terkonfirmasi. Jangan mencatat ulang trip yang sama.<button className="btn" disabled={!!draft.busy} onClick={() => void draft.liveTrip(draft.liveRetry!)}>Kirim ulang trip terakhir</button></div>}
    {!editable && <p className="clay-message">Laporan {statusLabels[report.status].toLowerCase()} dan hanya dapat dibaca. Supervisor dapat membuka ulang dengan alasan.</p>}

    <div role="tabpanel" id="clay-panel-0" aria-labelledby="clay-tab-0" hidden={tab !== 0} className="clay-panel">
      <FormSection title="Informasi operasi" description="Data dasar diisi sekali per shift.">
        <p className="clay-report-id">ID: {report.crusherCode}-{report.operationDate.replaceAll('-', '')}-{shiftLabel(report.shiftCode).replace('Shift ', '')} <span>· Versi {report.version}</span></p>
        <ContextFields context={report} lookup={lookup} onChange={contextChange} disabled={!!draft.busy} operator={<Field label="Operator"><input value={draft.header.operatorNameSnapshot} maxLength={160} disabled={summaryLocked} onChange={e => setHeader('operatorNameSnapshot', e.target.value)} placeholder="Nama operator crusher" /></Field>} />
      </FormSection>
      <FormSection title="Status shift" description="Running time aktual dicatat dalam menit. Jadwal berasal dari master shift.">
        <div className="clay-stat-grid"><div><span>Jadwal shift</span><strong>{shift ? `${shift.startTime.slice(0, 5)}–${shift.endTime.slice(0, 5)}` : 'Belum tersedia'}</strong><small>WITA{shift?.crossesMidnight ? ' · melewati tengah malam' : ''}</small></div><div><span>Running time aktual</span><strong>{running !== null && Number.isFinite(running) ? `${formatNumber(running / 60, 2)} jam` : 'Belum diisi'}</strong></div><div><span>Utilisasi shift</span><strong>{utilization !== null && Number.isFinite(utilization) ? `${formatNumber(utilization)}%` : '—'}</strong><small>Running time ÷ durasi shift</small></div></div>
        <div className="clay-fields clay-space-top">{numberField('runningMinutes', 'Running time aktual', 'menit')}{numberField('totalRunningMinutes', 'Total running time (kumulatif)', 'menit')}</div>
        {downtime !== null && shiftMinutes !== null && <div className="clay-calculation"><div><span>Estimasi dari jadwal</span><strong>{formatNumber((shiftMinutes - downtime) / 60, 2)} jam</strong><small>Durasi penuh shift dikurangi {downtime} menit gangguan. Bukan pembacaan waktu operasi aktual.</small></div>{qc && editable && <button className="btn" disabled={summaryLocked} onClick={() => setHeader('runningMinutes', String(shiftMinutes - downtime))}>Gunakan estimasi</button>}</div>}
      </FormSection>
      <FormSection title="Produksi & kapasitas" description="Salin angka produksi dan kapasitas seperti pada laporan kertas.">
        <div className="clay-fields three">{numberField('productionTonnage', 'Produksi', 'ton')}{numberField('capacityTph', 'Kapasitas', 't/h')}{numberField('stockPercent', 'Stok isi gudang', '%')}</div>
        <div className="clay-calculation"><div><span>Estimasi vs running time</span><strong>{efficiency !== null && Number.isFinite(efficiency) ? `${formatNumber(efficiency)}%` : '—'}</strong><small>Produksi ÷ kapasitas ÷ running time aktual (jam). Isi ketiganya untuk menghitung.</small></div></div>
      </FormSection>
      <FormSection title="Kondisi material & lokasi" description="Pilih lokasi dari daftar atau tulis lokasi pengambilan secara manual.">
        <div className="clay-fields"><Field label="Lokasi pengambilan"><input list="clay-source-locations" value={draft.header.pickupLocation} disabled={summaryLocked} maxLength={240} onChange={e => setHeader('pickupLocation', e.target.value)} placeholder="Contoh: Top Bontoa" /><datalist id="clay-source-locations">{[...new Set([...lookup.sources.map(x => x.label), ...report.columns.map(columnLabel)])].map(x => <option key={x} value={x} />)}</datalist></Field><Field label="Cuaca"><input list="clay-weather" value={draft.header.weather} disabled={summaryLocked} maxLength={120} onChange={e => setHeader('weather', e.target.value)} placeholder="Pilih atau tulis kondisi cuaca" /><datalist id="clay-weather">{['Cerah', 'Mendung', 'Hujan ringan', 'Hujan lebat'].map(x => <option key={x} value={x} />)}</datalist></Field><Field label="Pengisian pile"><input list="clay-piles" value={draft.header.pileFilling} disabled={summaryLocked} maxLength={160} onChange={e => setHeader('pileFilling', e.target.value)} placeholder="Contoh: Selatan 4–8" /><datalist id="clay-piles">{lookup.piles.map(x => <option key={x.id} value={x.label} />)}</datalist></Field></div>
        <p className="clay-help">Kondisi basah/kering dan keterangan material lainnya dapat ditulis pada Catatan shift.</p>
        <details className="clay-details"><summary>Kadar material & kehadiran</summary><div className="clay-fields three">{numberField('sm', 'SM', 'rasio')}{numberField('sio2', 'SiO₂', '%')}{numberField('h2o', 'H₂O', '%')}{numberField('attendancePresent', 'Hadir', 'orang')}{numberField('attendanceSick', 'Sakit', 'orang')}{numberField('attendanceOvertime', 'Lembur', 'orang')}{numberField('attendancePermission', 'Izin', 'orang')}{numberField('attendanceLeave', 'Cuti', 'orang')}</div></details>
      </FormSection>
    </div>

    <div role="tabpanel" id="clay-panel-1" aria-labelledby="clay-tab-1" hidden={tab !== 1} className="clay-panel">
      <FormSection title="Distribusi material per jam" description={operator ? 'Ketuk sel pada jam aktif untuk mencatat 1 trip live. Koreksi jam lain dilakukan oleh QC.' : 'Klik kotak untuk menambah trip. Shift+klik untuk mengurangi. Simpan Draft untuk mengirim perubahan.'} action={editable && <button className="btn" disabled={!!draft.busy || draft.retryRequired || !!draft.liveRetry} onClick={() => setColumnDialog('new')}>+ Tambah material</button>}>
        <div className="clay-grid-toolbar"><span className="clay-legend"><i /> Aktif = ada hauling</span>{qc && editable && <div className="clay-toggle" aria-label="Mode input trip"><button className={editMode === 1 ? 'selected' : ''} aria-pressed={editMode === 1} onClick={() => setEditMode(1)}>+ Tambah</button><button className={editMode === -1 ? 'selected' : ''} aria-pressed={editMode === -1} onClick={() => setEditMode(-1)}>− Kurangi</button></div>}<span className="clay-help">{pendingCells ? `${pendingCells} sel belum tersimpan` : 'Trip tersimpan di server'}</span></div>
        {activeColumns.length === 0 ? <div className="clay-empty"><strong>Belum ada material</strong><p>Tambahkan vendor atau sumber clay untuk membuat kolom pertama.</p></div> : <div className="clay-matrix-scroll" tabIndex={0} role="region" aria-label="Tabel distribusi material, geser ke samping bila perlu"><table className="clay-matrix"><caption className="clay-sr-only">Jumlah trip per jam dan material</caption><thead><tr><th scope="col">Jam</th>{activeColumns.map(c => <th scope="col" key={c.id}><span>{c.headerPrimary}</span>{c.headerSecondary && <small>{c.headerSecondary}</small>}{c.status === 'PROVISIONAL' && <small className="clay-pending-label">Perlu konfirmasi</small>}</th>)}<th scope="col">Total</th></tr></thead><tbody>{allRows.map(row => <tr key={row.hour} className={currentContext && row.hour === live.hour ? 'current-hour' : ''}><th scope="row">{row.hour}{row.nextDay && <small>+1 hari</small>}{!row.eventAt && <small>di luar shift</small>}</th>{activeColumns.map(c => {
          const value = countAt(c.id, row.hour), staged = !!draft.cells[cellKey(c.id, row.hour)];
          const allowed = canChangeGrid && !!row.eventAt && (qc || currentContext && row.hour === live.hour);
          return <td key={c.id}><button type="button" className={`clay-trip ${value > 0 ? 'has-trips' : ''} ${staged ? 'staged' : ''} ${value < 0 ? 'negative' : ''}`} aria-label={`${columnLabel(c)}, ${row.hour}: ${value} trip${staged ? ', belum tersimpan' : ''}`} disabled={!allowed} onClick={e => {
            if (qc) draft.adjustCell(c.id, row.hour, row.eventAt, e.shiftKey ? -1 : editMode);
            else void draft.liveTrip({ requestId: crypto.randomUUID(), operationDate: report.operationDate, shiftCode: report.shiftCode as ShiftCode, crusherId: report.crusherId, clayReportColumnId: c.id, clientTs: new Date().toISOString() });
          }}>{value === 0 ? '—' : formatNumber(value, 0)}{staged && <span className="clay-cell-dot" aria-hidden="true" />}</button></td>;
        })}<td className="clay-row-total">{activeColumns.reduce((sum, c) => sum + countAt(c.id, row.hour), 0)}</td></tr>)}</tbody><tfoot><tr><th scope="row">Total</th>{activeColumns.map(c => <td key={c.id}>{totals.find(x => x.column.id === c.id)?.count ?? 0}</td>)}<td>{total - hiddenTripTotal}</td></tr></tfoot></table></div>}
        {hiddenTripTotal !== 0 && <p className="clay-message warning">{hiddenTripTotal} trip berasal dari kolom nonaktif dan tetap masuk total laporan.</p>}
        {qc && editable && <Field label="Alasan koreksi" hint="Wajib jika mengurangi trip; ikut tersimpan pada jejak audit."><input value={draft.reason} maxLength={500} disabled={!!draft.busy || draft.retryRequired} onChange={e => draft.setReason(e.target.value)} placeholder="Contoh: koreksi hitungan pada form kertas" /></Field>}
        {editable && report.columns.length > 0 && <details className="clay-details"><summary>Kelola material{provisional ? ` · ${provisional} perlu konfirmasi` : ''}</summary><div className="clay-material-list">{report.columns.map(c => <div key={c.id}><div><strong>{columnLabel(c)}</strong><small>{c.status === 'PROVISIONAL' ? 'Menunggu konfirmasi QC' : c.status === 'INACTIVE' ? 'Nonaktif' : 'Terkonfirmasi'} · {c.inputMode === 'MANUAL' ? 'Nama manual' : 'Daftar material'}</small></div><div className="clay-actions">{(qc || c.status === 'PROVISIONAL') && <button className="btn" disabled={!!draft.busy || draft.dirty || draft.retryRequired} title={draft.dirty ? 'Simpan Draft sebelum mengubah kolom' : undefined} onClick={() => setColumnDialog(c)}>Ubah</button>}{qc && c.status === 'PROVISIONAL' && <button className="btn primary" disabled={!!draft.busy} onClick={() => void draft.perform('Mengonfirmasi material', async () => { draft.commit((await updateClayColumn(report.id, c.id, { status: 'CONFIRMED' })).report); })}>Konfirmasi</button>}{qc && <button className="btn" disabled={!!draft.busy || draft.dirty} onClick={() => void draft.perform('Mengubah status material', async () => { draft.commit((await updateClayColumn(report.id, c.id, { status: c.status === 'INACTIVE' ? 'CONFIRMED' : 'INACTIVE', reason: 'Pengaturan kolom pada laporan harian Clay' })).report); })}>{c.status === 'INACTIVE' ? 'Aktifkan' : 'Nonaktifkan'}</button>}</div></div>)}</div></details>}
      </FormSection>
      <div className="clay-summary-pair"><section><span>Asal material dominan</span><strong>{dominantNames}</strong><p>Dihitung dari jumlah trip{draft.dirty ? ', termasuk perubahan belum tersimpan' : ''}.</p></section><section className="accent"><span>Total trip shift</span><strong>{formatNumber(total, 0)} <small>trip</small></strong><p>Tercatat pada laporan dan riwayat retase Clay.</p></section></div>
    </div>

    <div role="tabpanel" id="clay-panel-2" aria-labelledby="clay-tab-2" hidden={tab !== 2} className="clay-panel">
      <FormSection title="Gangguan operasi" description="Pisahkan waktu berhenti dari catatan umum agar downtime bisa dihitung." action={editable && <button className="btn" disabled={!!draft.busy} onClick={draft.addLog}>+ Tambah gangguan</button>}>
        {report.operationLogs.length === 0 && draft.logs.length === 0 && <div className="clay-empty"><strong>Belum ada gangguan tercatat</strong><p>Jika operasi berhenti, tambahkan jam mulai, selesai, kategori, dan keterangan.</p></div>}
        <div className="clay-log-list">{report.operationLogs.map((log, index) => <article className="clay-log saved" key={log.id}><div className="clay-log-heading"><strong>Catatan {index + 1}</strong><span className="clay-saved-tag">✓ Tersimpan</span></div><div className="clay-fields three"><Field label="Mulai"><input type="time" readOnly value={log.startTime?.slice(0, 5) ?? ''} /></Field><Field label="Selesai"><input type="time" readOnly value={log.endTime?.slice(0, 5) ?? ''} /></Field><Field label="Kategori"><input readOnly value={categories[log.category] ?? log.category} /></Field></div><Field label="Keterangan"><textarea readOnly value={log.description} rows={2} /></Field></article>)}
        {draft.logs.map((log, index) => <article className="clay-log" key={log.localId}><div className="clay-log-heading"><strong>Gangguan baru {index + 1}</strong><span>Belum tersimpan</span><button className="clay-icon-button" aria-label={`Hapus gangguan baru ${index + 1}`} disabled={!!draft.busy} onClick={() => draft.setLogs(x => x.filter(item => item.localId !== log.localId))}>×</button></div><fieldset className="clay-fieldset" disabled={!!draft.busy}><div className="clay-fields three"><Field label="Mulai"><input type="time" value={log.startTime} onInput={e => { const value = e.currentTarget.value; draft.setLogs(x => x.map(item => item.localId === log.localId ? { ...item, startTime: value } : item)); }} /></Field><Field label="Selesai"><input type="time" value={log.endTime} onInput={e => { const value = e.currentTarget.value; draft.setLogs(x => x.map(item => item.localId === log.localId ? { ...item, endTime: value } : item)); }} /></Field><Field label="Kategori"><select value={log.category} onChange={e => draft.setLogs(x => x.map(item => item.localId === log.localId ? { ...item, category: e.target.value as typeof log.category } : item))}>{['BREAKDOWN', 'STOP', 'MAINTENANCE'].map(key => <option value={key} key={key}>{categories[key]}</option>)}</select></Field></div><Field label="Keterangan"><textarea maxLength={1000} value={log.description} rows={2} placeholder="Contoh: mekanik memperbaiki gap coupling" onChange={e => draft.setLogs(x => x.map(item => item.localId === log.localId ? { ...item, description: e.target.value } : item))} /></Field></fieldset></article>)}</div>
        {report.operationLogs.length > 0 && <p className="clay-help">Gangguan yang sudah tersimpan ditampilkan sebagai arsip. Tambahkan catatan untuk menjelaskan koreksi.</p>}
      </FormSection>
      <FormSection title="Catatan shift" description="Peralihan shift, kondisi material basah/kering, dan informasi untuk shift berikutnya."><Field label="Catatan shift"><textarea rows={4} maxLength={4000} value={draft.header.note} disabled={summaryLocked} onChange={e => setHeader('note', e.target.value)} placeholder="Contoh: Peralihan Shift I/II. Operasi normal setelah perbaikan mekanik." /></Field>{!qc && <p className="clay-help">Catatan utama dikelola QC / Supervisor. Operator dapat menambahkan gangguan di atas.</p>}</FormSection>
      <div className="clay-calculation downtime"><div><span>Total downtime</span><strong>{downtime !== null ? `${formatNumber(downtime, 0)} menit` : '—'}</strong><small>Dihitung dari gangguan dalam jadwal shift; waktu tumpang tindih dihitung sekali.{draft.logs.length > 0 ? ' Termasuk gangguan yang belum tersimpan.' : ''}</small></div></div>
    </div>

    <footer className="clay-footer"><div role="status" aria-live="polite"><strong>{draft.busy ? `${draft.busy}…` : draft.dirty ? 'Perubahan belum semuanya tersimpan' : `Tersimpan di server · ${formatTime(draft.savedAt)} WITA`}</strong><small>{editable ? (qc ? 'Ringkasan otomatis · Trip & gangguan: Simpan Draft' : 'Trip live otomatis · Gangguan: Simpan Draft') : statusLabels[report.status]}</small></div><div className="clay-actions">{editable && <button className="btn" disabled={!!draft.busy || !!draft.liveRetry} onClick={() => void saveDraft()}>Simpan Draft</button>}{tab > 0 && <button className="btn" onClick={() => step(tab - 1)}>← Kembali</button>}{tab < 2 && <button className="btn" onClick={() => step(tab + 1)}>Berikutnya →</button>}{qc && editable && <button className="btn primary" disabled={!!draft.busy || !!draft.liveRetry} onClick={() => { draft.setError(''); setWorkflow('submit'); }}>Submit Laporan</button>}{role === 'SUPERVISOR_ADMIN' && report.status === 'SUBMITTED' && <button className="btn primary" disabled={!!draft.busy} onClick={() => setWorkflow('approve')}>Setujui laporan</button>}{role === 'SUPERVISOR_ADMIN' && ['SUBMITTED', 'APPROVED'].includes(report.status) && <button className="btn" disabled={!!draft.busy} onClick={() => setWorkflow('reopen')}>Buka ulang</button>}</div></footer>

    {columnDialog && <ColumnDialog columns={report.columns} {...(columnDialog !== 'new' ? { column: columnDialog } : {})} lookup={lookup} onClose={() => setColumnDialog(null)} onSave={async input => {
      const succeeded = await draft.perform('Menyimpan material', async () => { draft.commit((await (columnDialog === 'new' ? createClayColumn(report.id, input) : updateClayColumn(report.id, columnDialog.id, input))).report); });
      if (!succeeded) throw new Error('Material belum tersimpan. Tutup dialog untuk melihat pesan, lalu coba lagi.');
    }} />}
    {workflow && <ClayDialog title={workflow === 'submit' ? 'Periksa sebelum submit' : workflow === 'approve' ? 'Setujui laporan ini?' : 'Buka ulang laporan'} onClose={() => setWorkflow(null)} busy={!!draft.busy}>
      <p>{workflow === 'submit' ? 'Perubahan draft akan disimpan, lalu laporan dikirim ke Supervisor untuk diperiksa.' : workflow === 'approve' ? 'Laporan akan ditandai disetujui dan tetap terkunci.' : 'Laporan kembali ke Draft. Alasan pembukaan ulang masuk riwayat audit.'}</p>
      {workflow === 'submit' && <><dl className="clay-review"><div><dt>Total trip</dt><dd>{total}</dd></div><div><dt>Downtime</dt><dd>{downtime ?? '—'} menit</dd></div><div><dt>Material perlu konfirmasi</dt><dd>{provisional}</dd></div></dl>{(provisional > 0 || !report.columns.some(c => c.status === 'CONFIRMED')) && <p className="clay-message warning">Konfirmasi setidaknya satu material dan seluruh kolom baru pada Distribusi Material.</p>}</>}
      {workflow === 'reopen' && <Field label="Alasan buka ulang"><textarea maxLength={500} value={workflowReason} onChange={e => setWorkflowReason(e.target.value)} /></Field>}
      {draft.error && <p className="clay-message error" role="alert">{draft.error}</p>}
      <div className="clay-dialog-actions"><button className="btn" disabled={!!draft.busy} onClick={() => setWorkflow(null)}>Batal</button><button className="btn primary" disabled={!!draft.busy || (workflow === 'reopen' && workflowReason.trim().length < 3) || (workflow === 'submit' && (provisional > 0 || !report.columns.some(c => c.status === 'CONFIRMED')))} onClick={() => void performWorkflow()}>{draft.busy ? 'Memproses…' : workflow === 'submit' ? 'Ya, submit laporan' : workflow === 'approve' ? 'Ya, setujui' : 'Buka ulang'}</button></div>
    </ClayDialog>}
    {blocker.status === 'blocked' && <ClayDialog title="Perubahan belum tersimpan" onClose={() => blocker.reset()} busy={!!draft.busy}><p>Simpan Draft sebelum meninggalkan laporan, atau lanjutkan tanpa menyimpan perubahan yang masih tertunda.</p><div className="clay-dialog-actions"><button className="btn" disabled={!!draft.busy} onClick={() => blocker.reset()}>Tetap di laporan</button><button className="btn" disabled={!!draft.busy} onClick={() => blocker.proceed()}>Tinggalkan</button></div></ClayDialog>}
  </div>;
}
