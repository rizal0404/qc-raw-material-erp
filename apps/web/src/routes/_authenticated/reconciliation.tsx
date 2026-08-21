import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type {
  MappingStatus,
  MaterialKind,
  ReconciliationAllocation,
  ReconciliationAssignment,
  ReconciliationException,
  ShiftCode,
} from '@qc/contracts';
import { masterLookups } from '../../features/qc/qc-api';
import {
  confirmRetaseAllocation,
  createRetaseAllocation,
  getExceptionAssignmentCandidates,
  getReconciliation,
  getReconciliationCandidates,
  getReconciliationEvents,
  resolveReconciliationException,
  updateRetaseAllocation,
} from '../../features/reconciliation/reconciliation-api';
import { Modal } from '../../components/modal';
import { businessDateToday } from '../../lib/business-date';

export const Route = createFileRoute('/_authenticated/reconciliation')({ component: ReconciliationPage });

const today = businessDateToday;
const fmtTime = (value: string) => new Date(value).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const statuses: MappingStatus[] = ['UNMAPPED', 'SUGGESTED', 'AMBIGUOUS', 'CONFIRMED', 'CONSUMED', 'REVIEW_REQUIRED'];
const editableAllocationStatuses: MappingStatus[] = ['SUGGESTED', 'AMBIGUOUS', 'REVIEW_REQUIRED'];

function badgeClass(status: MappingStatus) {
  if (status === 'CONFIRMED' || status === 'CONSUMED') return 'success';
  if (status === 'UNMAPPED' || status === 'AMBIGUOUS' || status === 'REVIEW_REQUIRED') return 'warning';
  return 'muted';
}

function ReconciliationPage() {
  const queryClient = useQueryClient();
  const lookups = useQuery({ queryKey: ['lookups', 'master'], queryFn: masterLookups, staleTime: 5 * 60_000 });
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState('');
  const [crusher, setCrusher] = useState('');
  const [vendor, setVendor] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReconciliationAssignment | null>(null);
  const [allocation, setAllocation] = useState<ReconciliationAllocation | null>(null);
  const [sampleId, setSampleId] = useState('');
  const [approved, setApproved] = useState('');
  const [note, setNote] = useState('');
  const [exception, setException] = useState<ReconciliationException | null>(null);
  const [exceptionAssignmentId, setExceptionAssignmentId] = useState('');
  const [exceptionReason, setExceptionReason] = useState('');
  const [message, setMessage] = useState('Ready');

  const query = useQuery({
    queryKey: ['reconciliation', date, shift, crusher, vendor, kind, status, search],
    queryFn: () => getReconciliation({
      operationDate: date,
      ...(shift ? { shiftCode: shift as ShiftCode } : {}),
      ...(crusher ? { crusherId: crusher } : {}),
      ...(vendor ? { vendorId: vendor } : {}),
      ...(kind ? { materialKind: kind as MaterialKind } : {}),
      ...(status ? { mappingStatus: status as MappingStatus } : {}),
      ...(search ? { search } : {}),
    }),
    enabled: Boolean(date),
  });

  const candidates = useQuery({
    queryKey: ['reconciliation-candidates', selected?.assignmentId],
    queryFn: () => getReconciliationCandidates(selected!.assignmentId),
    enabled: Boolean(selected),
  });

  const events = useQuery({
    queryKey: ['reconciliation-events', selected?.assignmentId],
    queryFn: () => getReconciliationEvents(selected!.assignmentId),
    enabled: Boolean(selected),
  });

  const exceptionAssignments = useQuery({
    queryKey: ['reconciliation-exception-assignments', exception?.eventId],
    queryFn: () => getExceptionAssignmentCandidates(exception!.eventId),
    enabled: Boolean(exception),
  });

  useEffect(() => {
    if (!selected) return;
    const editable = selected.allocations.find((item) => editableAllocationStatuses.includes(item.mappingStatus)) ?? null;
    setAllocation(editable);
    setSampleId(editable?.sampleId ?? selected.suggestedSampleId ?? '');
    setApproved(String(editable?.approvedRetase ?? (Math.max(0, selected.remainingRetase) || '')));
    setNote(editable?.note ?? '');
  }, [selected]);

  useEffect(() => {
    if (selected && candidates.data?.items.length === 1 && !sampleId) setSampleId(candidates.data.items[0]!.id);
  }, [candidates.data, selected, sampleId]);

  useEffect(() => {
    if (!exception) return;
    const list = exceptionAssignments.data?.items ?? [];
    const aaMatch = list.filter((item) => item.aaListed);
    if (!exceptionAssignmentId && aaMatch.length === 1) setExceptionAssignmentId(aaMatch[0]!.assignmentId);
  }, [exception, exceptionAssignments.data, exceptionAssignmentId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
    if (selected) {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reconciliation-candidates', selected.assignmentId] }),
        queryClient.invalidateQueries({ queryKey: ['reconciliation-events', selected.assignmentId] }),
      ]);
    }
  };

  const saveMapping = useMutation({
    mutationFn: async () => {
      if (!selected || !sampleId) throw new Error('Sample_ID wajib dipilih.');
      const value = Number(approved);
      if (!Number.isInteger(value) || value <= 0) throw new Error('Approved Retase harus bilangan bulat > 0.');
      const current = allocation ?? selected.allocations.find((item) => editableAllocationStatuses.includes(item.mappingStatus));
      if (current) return updateRetaseAllocation(current.id, { sampleId, approvedRetase: value, note: note || null });
      return createRetaseAllocation({ assignmentId: selected.assignmentId, sampleId, approvedRetase: value, note: note || null });
    },
    onSuccess: async (result) => {
      setAllocation(result.item);
      setMessage(`Mapping tersimpan sebagai ${result.item.mappingStatus}.`);
      await refresh();
    },
    onError: (error) => setMessage(error.message),
  });

  const confirmMapping = useMutation({
    mutationFn: async () => {
      let current = allocation ?? selected?.allocations.find((item) => editableAllocationStatuses.includes(item.mappingStatus));
      if (!current) {
        const saved = await saveMapping.mutateAsync();
        current = saved.item;
      }
      if (!current) throw new Error('Allocation belum tersedia.');
      return confirmRetaseAllocation(current.id, {
        approvedRetase: Number(approved),
        ...(note.trim().length >= 3 ? { reason: note.trim() } : {}),
      });
    },
    onSuccess: async () => {
      setMessage('Retase allocation CONFIRMED dan siap menjadi Workbench suggestion.');
      setSelected(null);
      setAllocation(null);
      await Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: ['retase-suggestions'] })]);
    },
    onError: (error) => setMessage(error.message),
  });

  const resolveException = useMutation({
    mutationFn: async () => {
      if (!exception || !exceptionAssignmentId) throw new Error('Assignment tujuan wajib dipilih.');
      if (exceptionReason.trim().length < 3) throw new Error('Reason reconciliation minimal 3 karakter.');
      return resolveReconciliationException(exception.eventId, { assignmentId: exceptionAssignmentId, reason: exceptionReason.trim() });
    },
    onSuccess: async () => {
      setMessage('Exception event berhasil direconcile menjadi VALID dan masuk assignment terpilih.');
      setException(null);
      setExceptionAssignmentId('');
      setExceptionReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['reconciliation'] }),
        queryClient.invalidateQueries({ queryKey: ['retase-events'] }),
        queryClient.invalidateQueries({ queryKey: ['retase-summary'] }),
      ]);
    },
    onError: (error) => setMessage(error.message),
  });

  const summary = query.data?.summary;
  const filteredCrushers = useMemo(() => {
    const all = lookups.data?.crushers ?? [];
    return kind ? all.filter((item) => item.materialKind === kind) : all;
  }, [lookups.data?.crushers, kind]);

  const canCreateNewAllocation = selected ? selected.remainingRetase > 0 : false;
  const isEditableAllocation = Boolean(allocation ?? selected?.allocations.find((item) => editableAllocationStatuses.includes(item.mappingStatus)));
  const showMappingForm = Boolean(selected && (isEditableAllocation || canCreateNewAllocation) && selected.mappingStatus !== 'CONSUMED');

  return (
    <section className="page-stack reconciliation-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">SLICE 06 / QC CONTROL</p>
          <h1>QC Reconciliation + Retase Mapping</h1>
          <p>Observed crusher event → assignment → Vendor-based Sample_ID candidate → QC confirmation → Workbench suggestion → Mix consumption.</p>
        </div>
        <span className="status-badge success">SERVER CONTROLLED</span>
      </div>

      <div className="card reconciliation-filters">
        <label><span>Operation Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><span>Shift</span><select value={shift} onChange={(event) => setShift(event.target.value)}><option value="">ALL</option>{(lookups.data?.shifts ?? []).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
        <label><span>Material</span><select value={kind} onChange={(event) => { setKind(event.target.value); setCrusher(''); }}><option value="">ALL</option><option value="LS">Limestone</option><option value="CL">Clay</option></select></label>
        <label><span>Crusher</span><select value={crusher} onChange={(event) => setCrusher(event.target.value)}><option value="">ALL</option>{filteredCrushers.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Vendor</span><select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">ALL</option>{(lookups.data?.vendors ?? []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Status</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">ALL</option>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="span-2"><span>Search</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Vendor, AM, source, block..." /></label>
        <div className="filter-button"><button className="btn" onClick={() => void query.refetch()}>Refresh</button></div>
      </div>

      <div className="reconciliation-kpis">
        <div className="card kpi"><span>Assignments</span><strong>{summary?.assignmentCount ?? 0}</strong></div>
        <div className="card kpi"><span>Observed Retase</span><strong>{summary?.observedRetase ?? 0}</strong></div>
        <div className="card kpi"><span>Reserved</span><strong>{summary?.reservedRetase ?? 0}</strong></div>
        <div className="card kpi"><span>Remaining</span><strong>{summary?.remainingRetase ?? 0}</strong></div>
        <div className="card kpi"><span>Review Required</span><strong>{summary?.reviewRequired ?? 0}</strong></div>
        <div className="card kpi"><span>Event Exception</span><strong>{(summary?.unassignedEvents ?? 0) + (summary?.ambiguousEvents ?? 0)}</strong></div>
      </div>

      <div className="card reconciliation-banner">
        <strong>{message}</strong>
        <small>Candidate rule saat ini: Operation Date + Material Kind + field Vendor sesuai keputusan OD-06.</small>
      </div>

      <div className="card table-card">
        <div className="section-toolbar"><div><strong>Assignment Reconciliation</strong><small>Reserved = CONFIRMED/REVIEW_REQUIRED approved + CONSUMED actual. Remaining = Observed − Reserved.</small></div><span className="toolbar-meta">{query.data?.items.length ?? 0} assignment</span></div>
        <div className="table-shell">
          <table className="native-table reconciliation-table">
            <thead><tr><th>Shift / Crusher</th><th>Vendor / AM</th><th>Source / Block</th><th>AA</th><th>Observed</th><th>Reserved</th><th>Remaining</th><th>Candidate</th><th>Status</th><th>Allocation</th><th>Exception</th><th>Aksi</th></tr></thead>
            <tbody>
              {(query.data?.items ?? []).map((item) => (
                <tr key={item.assignmentId}>
                  <td><strong>{item.shiftCode}</strong><small className="table-sub">{item.crusherName}</small></td>
                  <td>{item.vendorName}<small className="table-sub">AM {item.amUnitNo}</small></td>
                  <td>{item.sourceName ?? '—'}<small className="table-sub">{item.blockSnapshot ?? item.materialCategory}</small></td>
                  <td>{item.aaWithDumpCount}/{item.assignedAaCount}</td>
                  <td><strong>{item.observedRetase}</strong></td><td>{item.reservedRetase}</td><td className={item.remainingRetase < 0 ? 'warn-text' : ''}>{item.remainingRetase}</td>
                  <td>{item.candidateCount}{item.suggestedSampleCode ? <small className="table-sub">{item.suggestedSampleCode}</small> : null}</td>
                  <td><span className={`status-badge ${badgeClass(item.mappingStatus)}`}>{item.mappingStatus}</span>{item.reviewRequired && <small className="table-sub warn-text">REVIEW</small>}</td>
                  <td>{item.allocations.length ? item.allocations.map((entry) => <div key={entry.id} className="allocation-chip"><span>{entry.sampleCode ?? '—'} · {entry.approvedRetase ?? '—'} ret</span><small>{entry.mappingStatus}{entry.consumedMixCode ? ` · ${entry.consumedMixCode}` : ''}</small></div>) : '—'}</td>
                  <td><small>{item.exception ?? '—'}</small></td>
                  <td><button className="btn small" onClick={() => setSelected(item)}>{item.remainingRetase <= 0 && ['CONFIRMED', 'CONSUMED'].includes(item.mappingStatus) ? 'Trace' : 'Map / Review'}</button></td>
                </tr>
              ))}
              {!query.isFetching && !query.data?.items.length && <tr><td colSpan={12} className="table-empty">Tidak ada assignment sesuai filter.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card table-card">
        <div className="section-toolbar"><div><strong>Unassigned / Ambiguous Dump Events</strong><small>Exception dapat direconcile QC ke assignment valid tanpa menghapus event asli.</small></div><span className="toolbar-meta">{query.data?.exceptions.length ?? 0} event</span></div>
        <div className="table-shell">
          <table className="native-table">
            <thead><tr><th>Time</th><th>Shift</th><th>Crusher</th><th>Vendor</th><th>AA</th><th>Status</th><th>Reason</th><th>Aksi</th></tr></thead>
            <tbody>
              {(query.data?.exceptions ?? []).map((item) => <tr key={item.eventId}><td>{fmtTime(item.eventTs)}</td><td>{item.shiftCode}</td><td>{item.crusherName}</td><td>{item.vendorName ?? '—'}</td><td>{item.aaUnitNo ?? '—'}</td><td><span className="status-badge warning">{item.status}</span></td><td>{item.reason ?? '—'}</td><td><button className="btn small" onClick={() => { setException(item); setExceptionAssignmentId(''); setExceptionReason(''); }}>Resolve</button></td></tr>)}
              {!query.data?.exceptions.length && <tr><td colSpan={8} className="table-empty">Tidak ada event exception.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <Modal
          title="Retase Mapping"
          subtitle={`${selected.vendorName} · AM ${selected.amUnitNo} · ${selected.crusherName}`}
          onClose={() => { setSelected(null); setAllocation(null); }}
          footer={<><button className="btn" onClick={() => { setSelected(null); setAllocation(null); }}>Tutup</button>{selected.mappingStatus !== 'CONSUMED' && <><button className="btn" disabled={!showMappingForm || !sampleId || saveMapping.isPending} onClick={() => saveMapping.mutate()}>Save Mapping</button><button className="btn primary" disabled={!showMappingForm || !sampleId || Number(approved) <= 0 || confirmMapping.isPending} onClick={() => confirmMapping.mutate()}>Save & Confirm</button></>}</>}
        >
          <div className="reconciliation-modal-grid"><div className="card-lite"><span>Observed</span><strong>{selected.observedRetase}</strong></div><div className="card-lite"><span>Reserved</span><strong>{selected.reservedRetase}</strong></div><div className="card-lite"><span>Remaining</span><strong>{selected.remainingRetase}</strong></div><div className="card-lite"><span>Candidate</span><strong>{candidates.data?.items.length ?? selected.candidateCount}</strong></div></div>

          {showMappingForm ? (
            <div className="form-grid reconciliation-map-form">
              <label className="span-2"><span>Sample_ID Candidate</span><select value={sampleId} onChange={(event) => setSampleId(event.target.value)}><option value="">— pilih sample —</option>{(candidates.data?.items ?? []).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.sampleId} · {candidate.typeGrade ?? '—'} · {candidate.matchMode}</option>)}</select></label>
              <label><span>Approved Retase</span><input type="number" min="1" step="1" value={approved} onChange={(event) => setApproved(event.target.value)} /></label>
              <label><span>Mapping Status</span><input readOnly value={allocation?.mappingStatus ?? selected.mappingStatus} /></label>
              <label className="span-2"><span>Note / Reason</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Wajib bila candidate > 1 atau perlu menjelaskan override/review" /></label>
            </div>
          ) : <div className="inline-alert">Seluruh observed retase sudah reserved/consumed. Mode ini hanya untuk traceability.</div>}

          <div className="dialog-section"><strong>Sample Candidate Detail</strong><div className="candidate-list">{(candidates.data?.items ?? []).map((candidate) => <button type="button" key={candidate.id} className={`candidate-card ${sampleId === candidate.id ? 'selected' : ''}`} disabled={!showMappingForm} onClick={() => setSampleId(candidate.id)}><span>{candidate.sampleId}</span><small>{candidate.vendorSnapshot ?? '—'} · {candidate.sourceSnapshot ?? '—'} · {candidate.block ?? '—'}</small><small>LSF {candidate.quality.lsf?.toFixed(2) ?? '—'} · SM {candidate.quality.sm?.toFixed(2) ?? '—'} · AM {candidate.quality.am?.toFixed(2) ?? '—'}</small></button>)}{!candidates.data?.items.length && <div className="table-empty">Tidak ada candidate berdasarkan field Vendor.</div>}</div></div>
          <div className="dialog-section"><strong>Assignment Event Drilldown</strong><div className="table-shell compact"><table className="native-table"><thead><tr><th>Time</th><th>AA</th><th>Type</th><th>Δ</th><th>Status</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{(events.data?.items ?? []).map((event) => <tr key={event.id}><td>{fmtTime(event.eventTs)}</td><td>{event.aaUnitNo ?? '—'}</td><td>{event.eventType}</td><td>{event.delta > 0 ? '+1' : '-1'}</td><td>{event.status}</td><td>{event.createdByName}</td><td>{event.reason ?? '—'}</td></tr>)}</tbody></table></div></div>
        </Modal>
      )}

      {exception && (
        <Modal
          title="Resolve Retase Exception"
          subtitle={`${exception.status} · ${exception.vendorName ?? 'Vendor belum teridentifikasi'} · AA ${exception.aaUnitNo ?? '—'}`}
          onClose={() => setException(null)}
          footer={<><button className="btn" onClick={() => setException(null)}>Batal</button><button className="btn primary" disabled={!exceptionAssignmentId || exceptionReason.trim().length < 3 || resolveException.isPending} onClick={() => resolveException.mutate()}>Resolve to Assignment</button></>}
        >
          <div className="inline-alert">Resolusi ini tidak menghapus DUMP event. Sistem hanya mengklasifikasikan ulang exception menjadi VALID, menautkan assignment, dan menyimpan actor/reason/timestamp audit.</div>
          <div className="dialog-section"><strong>Assignment Candidates</strong><div className="candidate-list">{(exceptionAssignments.data?.items ?? []).map((candidate) => <button type="button" key={candidate.assignmentId} className={`candidate-card ${exceptionAssignmentId === candidate.assignmentId ? 'selected' : ''}`} onClick={() => setExceptionAssignmentId(candidate.assignmentId)}><span>{candidate.vendorName} · AM {candidate.amUnitNo}</span><small>{candidate.sourceName ?? '—'} · {candidate.blockSnapshot ?? candidate.materialCategory} · {candidate.crusherName}</small><small>{candidate.aaListed ? 'AA tercantum pada assignment' : 'AA tidak tercantum — manual assignment review'}</small></button>)}{!exceptionAssignments.data?.items.length && <div className="table-empty">Tidak ada assignment candidate pada operation date / shift / crusher / vendor yang sama. Perbaiki Shift Report, Operational Assignment, atau master data terlebih dahulu.</div>}</div></div>
          <label><span>Resolution Reason</span><textarea rows={3} value={exceptionReason} onChange={(event) => setExceptionReason(event.target.value)} placeholder="Contoh: Unit pengganti AA 112, dikonfirmasi ke assignment AM 12." /></label>
        </Modal>
      )}
    </section>
  );
}
