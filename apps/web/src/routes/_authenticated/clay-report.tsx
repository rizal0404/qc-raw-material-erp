import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { ClayReport, ClayReportContext } from '@qc/contracts';
import { authQueryOptions } from '../../features/auth/auth-query';
import { masterLookupsFor } from '../../features/qc/qc-api';
import { ensureClayReport, getCurrentClayReport } from '../../features/clay-report/clay-report-api';
import { ClayHeading, ClayReportForm, ContextFields } from '../../features/clay-report/clay-report-form';
import { FormSection } from '../../features/clay-report/clay-form-parts';
import { currentShiftContext } from '../../features/clay-report/clay-form-model';
import { ApiClientError } from '../../lib/api-client';

export const Route = createFileRoute('/_authenticated/clay-report')({ component: ClayReportPage });

function ClayReportPage() {
  const queryClient = useQueryClient();
  const auth = useQuery(authQueryOptions), user = auth.data?.user;
  const allowed = !!user && user.role !== 'VENDOR';
  const lookup = useQuery({ queryKey: ['lookups', 'master', 'CL'], queryFn: () => masterLookupsFor('CL'), enabled: allowed, staleTime: 300_000 });
  const scopedLookup = useMemo(() => {
    if (!lookup.data) return null;
    const crushers = lookup.data.crushers.filter(x => x.materialKind === 'CL' && (user?.role !== 'CRUSHER_OPERATOR' || user.crusherIds.includes(x.id)));
    return { ...lookup.data, crushers };
  }, [lookup.data, user]);
  const [context, setContext] = useState<ClayReportContext | null>(null);
  const [creating, setCreating] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    if (!context && scopedLookup?.crushers[0]) {
      const current = currentShiftContext(scopedLookup.shifts);
      setContext({ operationDate: current.operationDate, shiftCode: current.shiftCode || scopedLookup.shifts[0]?.code || 'SHIFT_1', crusherId: scopedLookup.crushers[0].id });
    }
  }, [context, scopedLookup]);
  const reportKey = ['clay-report', context];
  const reportQuery = useQuery({
    queryKey: reportKey,
    queryFn: async () => {
      try { return await getCurrentClayReport(context!); }
      catch (e) { if (e instanceof ApiClientError && e.status === 404) return null; throw e; }
    },
    enabled: allowed && !!context?.crusherId, retry: false, refetchOnWindowFocus: false,
  });
  function onReport(report: ClayReport) { queryClient.setQueryData(reportKey, { ok: true, report }); }
  function changeContext(value: ClayReportContext) {
    setError('');
    setContext({ operationDate: value.operationDate, shiftCode: value.shiftCode, crusherId: value.crusherId });
  }
  async function createReport() {
    if (!context) return;
    setCreating(true); setError('');
    try { onReport((await ensureClayReport(context)).report); }
    catch (e) { setError(e instanceof Error ? e.message : 'Laporan belum dapat dibuat.'); }
    finally { setCreating(false); }
  }

  if (!allowed) return <div className="clay-page"><p className="clay-message">Laporan Clay tersedia untuk Operator Crusher, QC Analyst, dan Supervisor.</p></div>;
  if (lookup.isError) return <div className="clay-page"><p className="clay-message error" role="alert">Daftar unit dan material gagal dimuat: {lookup.error.message}</p><button className="btn" onClick={() => void lookup.refetch()}>Coba lagi</button></div>;
  if (!scopedLookup) return <div className="clay-page clay-empty" role="status">Memuat daftar unit dan shift…</div>;
  if (!scopedLookup.crushers.length) return <div className="clay-page clay-empty"><h1>Laporan Harian Crusher</h1><p>Belum ada Clay Crusher yang dapat Anda akses. Hubungi Supervisor untuk pengaturan unit.</p></div>;
  if (!context) return <div className="clay-page clay-empty" role="status">Menyiapkan konteks laporan…</div>;
  if (reportQuery.data?.report && user) return <ClayReportForm key={reportQuery.data.report.id} report={reportQuery.data.report} lookup={scopedLookup} role={user.role} onReport={onReport} onContextChange={changeContext} />;
  return <div className="clay-page">
    <ClayHeading unit={scopedLookup.crushers.find(x => x.id === context.crusherId)?.label ?? ''} date={context.operationDate} shift={context.shiftCode} />
    <FormSection title="Informasi operasi" description="Pilih tanggal, shift, dan unit untuk membuka laporan."><ContextFields context={context} lookup={scopedLookup} onChange={changeContext} disabled={creating} /></FormSection>
    {reportQuery.isError ? <div className="clay-message error" role="alert"><p>Laporan gagal dimuat: {reportQuery.error.message}</p><button className="btn" onClick={() => void reportQuery.refetch()}>Coba lagi</button></div> : reportQuery.isFetching ? <div className="clay-empty" role="status">Memuat laporan…</div> : <section className="clay-section clay-empty"><span className="clay-empty-symbol" aria-hidden="true">▤</span><h2>Mulai laporan shift ini</h2><p>Belum ada laporan untuk konteks yang dipilih. Buat draft, lalu isi ringkasan, distribusi material, dan gangguan operasi.</p><button className="btn primary" disabled={creating || !context.crusherId} onClick={() => void createReport()}>{creating ? 'Membuat draft…' : 'Buat laporan baru'}</button></section>}
    {error && <p className="clay-message error" role="alert">{error}</p>}
  </div>;
}
