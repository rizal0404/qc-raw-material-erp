import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { MaterialKind, Role } from '@qc/contracts';
import { authQueryOptions } from '../../features/auth/auth-query';
import { listMixes, listSamples, masterLookupsFor } from '../../features/qc/qc-api';
import { entryFor, materialNames, roleLabels, workflowNavigation } from '../../features/navigation/workflow';
import { businessDateToday } from '../../lib/business-date';
import { AppIcon } from '../../components/app-icon';

export const Route = createFileRoute('/_authenticated/')({ component: HomePage });

function WorkflowCard({ kind, role, date }: { kind: MaterialKind; role: Role; date: string }) {
  const canReadQc = role === 'QC_ANALYST' || role === 'SUPERVISOR_ADMIN';
  const stats = useQuery({
    queryKey: ['workspace-stats', kind, date, role],
    queryFn: async () => {
      const [samples, mixes] = await Promise.all([
        listSamples({ materialKind: kind, operationDate: date, limit: 1, offset: 0 }),
        listMixes({ materialKind: kind, operationDate: date, status: 'ACTIVE', limit: 1, offset: 0 }),
      ]);
      return { samples: samples.total, mixes: mixes.total };
    }, enabled: canReadQc,
  });
  const lookups = useQuery({ queryKey: ['lookups', 'master', kind], queryFn: () => masterLookupsFor(kind), staleTime: 300_000 });
  const shortcuts = workflowNavigation(role, kind).filter(item => item.to !== entryFor(role, kind));
  return <article className={`workflow-card material-${kind.toLowerCase()}`}>
    <div className="workflow-card-top"><span className="material-icon"><AppIcon name={kind === 'LS' ? 'limestone' : 'clay'} size={29} /></span><span className="workflow-code">{kind === 'LS' ? '01' : '02'} / {kind}</span></div>
    <div className="workflow-card-title"><h2>{materialNames[kind]}</h2><span className="workflow-pill">{kind === 'LS' ? 'Batu kapur' : 'Tanah liat'}</span></div>
    <p className="workflow-description">{kind === 'LS' ? 'Dari armada vendor hingga komposisi mixing. Kendalikan mutu di setiap tahap.' : 'Pencatatan crusher dan distribusi material dalam alur Clay yang mandiri.'}</p>
    <div className="workflow-stages" aria-label={`Alur ${materialNames[kind]}`}>
      {(kind === 'LS' ? ['Shift vendor', 'Retase', 'Quality control'] : ['Laporan crusher', 'Sampel lab', 'Mixing']).map((step, index) => <span key={step}><i>{index + 1}</i>{step}{index < 2 && <AppIcon name="chevron" size={12} />}</span>)}
    </div>
    <div className="workflow-stats">
      {canReadQc && <><div><strong>{stats.isError ? '—' : stats.data?.samples ?? '…'}</strong><span>Sampel hari ini</span></div><div><strong>{stats.isError ? '—' : stats.data?.mixes ?? '…'}</strong><span>Mix hari ini</span></div></>}
      <div><strong>{lookups.isError ? '—' : lookups.data?.crushers.length ?? '…'}</strong><span>Crusher tersedia</span></div>
    </div>
    {(stats.isError || lookups.isError) && <div className="workspace-load-error" role="alert">Ringkasan belum dapat dimuat. <button type="button" onClick={() => { if (canReadQc) void stats.refetch(); void lookups.refetch(); }}>Coba lagi</button></div>}
    <Link to={entryFor(role, kind)} search={{ material: kind }} className="workflow-primary">Buka workspace {materialNames[kind]}<AppIcon name="arrow" size={18} /></Link>
    {shortcuts.length > 0 && <div className="workflow-shortcuts">{shortcuts.slice(0, 3).map(item => <Link key={item.to} to={item.to} search={{ material: kind }}>{item.label}<AppIcon name="chevron" size={12} /></Link>)}</div>}
  </article>;
}

function HomePage() {
  const { data } = useQuery(authQueryOptions);
  if (!data?.authenticated) return null;
  const { user } = data;
  const date = businessDateToday();
  const dateLabel = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  return <section className="dashboard-page">
    <div className="dashboard-welcome"><div><p className="eyebrow">RUANG KERJA / QUALITY CONTROL</p><h1>Selamat datang, {user.displayName.split(' ')[0]}<span>.</span></h1><p>Setiap material, alur yang terarah. Mulai pekerjaan Anda di sini.</p></div><span className="dashboard-date"><AppIcon name="calendar" size={17} />{dateLabel}</span></div>
    <div className="dashboard-intro"><div><span className="intro-overline">RAW MATERIAL OPERATIONS</span><h2>Dua material.<br /><span>Satu kendali mutu.</span></h2><p>Pantau, catat, dan pastikan kualitas bahan baku.<br />Pilih workspace sesuai material yang Anda kerjakan.</p></div><div className="intro-materials" aria-hidden="true"><div className="intro-layer layer-ls"><span>LS</span><AppIcon name="limestone" size={48} /></div><div className="intro-layer layer-cl"><span>CL</span><AppIcon name="clay" size={48} /></div><span className="intro-caption">INDEPENDENT WORKFLOWS · CONNECTED DATA</span></div></div>
    <div className="workspace-section-heading"><div><h2>Workspace material</h2><p>Data dan aktivitas terpisah untuk setiap material.</p></div><span className="workspace-count">02 WORKSPACES</span></div>
    <div className="workflow-grid"><WorkflowCard kind="LS" role={user.role} date={date} /><WorkflowCard kind="CL" role={user.role} date={date} /></div>
    <div className="workspace-note"><span className="note-icon"><AppIcon name="shield" size={22} /></span><div><strong>Ruang kerja sesuai peran Anda</strong><p>{roleLabels[user.role]} · Menu mengikuti hak akses akun. Master data dikelola bersama, sementara transaksi tetap terpisah per material.</p></div><Link to="/security" search={{}}>Keamanan akun<AppIcon name="arrow" size={16} /></Link></div>
  </section>;
}
