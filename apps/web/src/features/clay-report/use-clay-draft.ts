import { useEffect, useRef, useState } from 'react';
import { CreateClayOperationLogRequestSchema, type ClayHourlyBackfillRequest, type ClayReport, type CreateClayOperationLogRequest, type RecordRetaseEventRequest } from '@qc/contracts';
import { addClayLog, backfillClay, getCurrentClayReport, patchClayReport } from './clay-report-api';
import { recordRetase } from '../retase/retase-api';
import { adjustCellDelta, cellKey, headerFromReport, headerPatch, nextDisplayOrder } from './clay-form-model';

export type DraftLog = { localId: string; displayOrder: number; startTime: string; endTime: string; category: CreateClayOperationLogRequest['category']; description: string };
export type DraftCell = { columnId: string; hour: string; eventAt: string; delta: number };
const fingerprint = (value: unknown) => JSON.stringify(value);
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Penyimpanan gagal. Periksa koneksi dan coba lagi.';

export function useClayDraft(report: ClayReport, canEditHeader: boolean, onReport: (report: ClayReport) => void) {
  const [header, setHeader] = useState(() => headerFromReport(report));
  const [savedHeader, setSavedHeader] = useState(() => fingerprint(headerFromReport(report)));
  const [cells, setCells] = useState<Record<string, DraftCell>>({});
  const [logs, setLogs] = useState<DraftLog[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState('');
  const [savedAt, setSavedAt] = useState(report.updatedAt);
  const [retryRequired, setRetryRequired] = useState(false);
  const [liveRetry, setLiveRetry] = useState<RecordRetaseEventRequest | null>(null);
  const latest = useRef(report); latest.current = report;
  const headerRef = useRef(header); headerRef.current = header;
  const savedRef = useRef(savedHeader); savedRef.current = savedHeader;
  const locked = useRef(false), autoAttempt = useRef('');
  const frozenBatches = useRef<Record<string, ClayHourlyBackfillRequest>>({});
  const dirtyHeader = fingerprint(header) !== savedHeader;
  const dirty = dirtyHeader || Object.keys(cells).length > 0 || logs.length > 0 || liveRetry !== null;

  function commit(value: ClayReport) { latest.current = value; onReport(value); setSavedAt(new Date().toISOString()); }
  async function persistHeader() {
    if (!canEditHeader || fingerprint(headerRef.current) === savedRef.current) return latest.current;
    const snapshot = { ...headerRef.current };
    let body;
    try { body = headerPatch(snapshot); } catch { throw new Error('Periksa ringkasan: gunakan angka positif, menit/jumlah orang bulat, dan stok antara 0–100%.'); }
    const result = await patchClayReport(report.id, body);
    savedRef.current = fingerprint(snapshot); setSavedHeader(savedRef.current); commit(result.report);
    return result.report;
  }

  async function perform(label: string, action: () => Promise<void>) {
    if (locked.current) return false;
    locked.current = true; setBusy(label); setError('');
    try { await action(); return true; } catch (e) { setError(errorText(e)); return false; }
    finally { locked.current = false; setBusy(''); }
  }

  useEffect(() => {
    const key = fingerprint(header);
    if (!canEditHeader || report.status !== 'DRAFT' || !dirtyHeader || busy || autoAttempt.current === key) return;
    const timer = window.setTimeout(() => {
      autoAttempt.current = key;
      void perform('Menyimpan header', async () => { await persistHeader(); });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [header, dirtyHeader, busy, canEditHeader, report.status]);

  function adjustCell(columnId: string, hour: string, eventAt: string, change: number) {
    if (locked.current || retryRequired) return;
    const key = cellKey(columnId, hour), existing = report.hourly.find(x => x.columnId === columnId && x.hour === hour)?.retase ?? 0;
    setError('');
    // Validation stays outside React's state updater: it must be a pure function.
    try {
      adjustCellDelta(existing, cells[key]?.delta ?? 0, change);
      setCells(previous => {
        const delta = (previous[key]?.delta ?? 0) + change;
        if (existing + delta < 0 || Math.abs(delta) > 250) return previous;
        const next = { ...previous };
        if (delta === 0) delete next[key]; else next[key] = { columnId, hour, eventAt, delta };
        return next;
      });
    } catch (e) { setError(errorText(e)); }
  }

  function addLog() {
    if (locked.current) return;
    try { const displayOrder = nextDisplayOrder([...report.operationLogs, ...logs]); setLogs(x => [...x, { localId: crypto.randomUUID(), displayOrder, startTime: '', endTime: '', category: 'BREAKDOWN', description: '' }]); }
    catch (e) { setError(errorText(e)); }
  }

  async function persistAll() {
    if (liveRetry) throw new Error('Kirim ulang trip live yang belum terkonfirmasi sebelum melanjutkan.');
    const hasCorrection = Object.values(cells).some(x => x.delta < 0);
    if (hasCorrection && reason.trim().length < 3) throw new Error('Isi alasan koreksi pada Distribusi Material sebelum menyimpan pengurangan trip.');
    // Validate all unsaved data before the first write; retain successful portions on a later failure.
    if (canEditHeader) {
      try { headerPatch(headerRef.current); }
      catch { throw new Error('Periksa ringkasan: gunakan angka positif, menit/jumlah orang bulat, dan stok antara 0–100%.'); }
    }
    const logPayloads = logs.map(log => {
      if (!log.startTime || !log.endTime || log.startTime === log.endTime) throw new Error('Lengkapi jam mulai dan selesai gangguan; waktunya tidak boleh sama.');
      const parsed = CreateClayOperationLogRequestSchema.safeParse({ ...log, startTime: log.startTime || null, endTime: log.endTime || null });
      if (!parsed.success) throw new Error('Lengkapi keterangan setiap gangguan (maksimum 1.000 karakter).');
      return { log, payload: parsed.data };
    });
    await persistHeader();
    for (const { log, payload } of logPayloads) {
      let next: ClayReport;
      try { next = (await addClayLog(report.id, payload)).report; }
      catch (originalError) {
        // The server may have committed before the response was lost. Resolve by its unique order.
        const current = (await getCurrentClayReport(report)).report;
        const saved = current.operationLogs.find(x => x.displayOrder === payload.displayOrder);
        if (!saved || saved.description !== payload.description || saved.category !== payload.category || saved.startTime?.slice(0, 5) !== payload.startTime || saved.endTime?.slice(0, 5) !== payload.endTime) throw originalError;
        next = current;
      }
      commit(next); setLogs(x => x.filter(item => item.localId !== log.localId));
    }
    for (const [key, cell] of Object.entries(cells)) {
      const input = frozenBatches.current[key] ?? {
        requestId: crypto.randomUUID(), batchId: crypto.randomUUID(), columnId: cell.columnId, eventAt: cell.eventAt, delta: cell.delta,
        reason: reason.trim() || 'Input distribusi material per jam dari form laporan Clay',
      };
      frozenBatches.current[key] = input;
      try { commit((await backfillClay(report.id, input)).report); }
      catch (e) { setRetryRequired(true); throw e; }
      delete frozenBatches.current[key]; setCells(x => { const next = { ...x }; delete next[key]; return next; });
    }
    setRetryRequired(false);
    return latest.current;
  }

  async function liveTrip(input: RecordRetaseEventRequest) {
    return perform('Mencatat trip live', async () => {
      setLiveRetry(input);
      await recordRetase(input);
      commit((await getCurrentClayReport(report)).report);
      setLiveRetry(null);
    });
  }

  return { header, setHeader, cells, logs, setLogs, reason, setReason, busy, error, setError, savedAt, dirty, dirtyHeader, retryRequired, liveRetry, perform, persistAll, commit, adjustCell, addLog, liveTrip };
}
