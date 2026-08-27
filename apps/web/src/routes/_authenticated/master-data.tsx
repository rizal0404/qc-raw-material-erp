import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { Crusher, Equipment, MasterLookupResponse, Pile, Plant, Source, Vendor } from '@qc/contracts';
import { DataTable } from '../../components/data-table';
import { Modal } from '../../components/modal';
import { authQueryOptions } from '../../features/auth/auth-query';
import { createMaster, listMaster, masterKeys, masterLookupQueryOptions, type MasterEntity } from '../../features/master/master-api';
import { updateMaster } from '../../features/master/master-api';
import { ApiClientError } from '../../lib/api-client';

export const Route = createFileRoute('/_authenticated/master-data')({
  beforeLoad: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(authQueryOptions);
    if (!auth.authenticated || auth.user.role !== 'SUPERVISOR_ADMIN') throw redirect({ to: '/' });
  },
  component: MasterDataPage,
});

type Tab = 'vendors' | 'equipment' | 'crushers' | 'sources' | 'plants' | 'piles';
type RowItem = Vendor | Equipment | Crusher | Source | Plant | Pile;

type FormState = Record<string, string | boolean>;
const tabs: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'vendors', label: 'Vendor', hint: 'Perusahaan pemasok / transporter' },
  { id: 'equipment', label: 'Equipment', hint: 'AM dan AA per vendor' },
  { id: 'crushers', label: 'Crusher', hint: 'Crusher Limestone / Clay' },
  { id: 'sources', label: 'Source / Block', hint: 'Source, block, material category' },
  { id: 'plants', label: 'Plant', hint: 'Master plant produksi' },
  { id: 'piles', label: 'Pile', hint: 'Pile per plant dan material' },
];

function activeLabel(active: boolean) { return <span className={`status-badge ${active ? 'success' : 'muted'}`}>{active ? 'ACTIVE' : 'INACTIVE'}</span>; }
function aliasesToText(value: unknown) { return Array.isArray(value) ? value.join(', ') : ''; }
function aliasesFromText(value: string) { return value.split(',').map((x) => x.trim()).filter(Boolean); }
function nullable(value: string) { const v = value.trim(); return v ? v : null; }

function defaultForm(tab: Tab, lookups?: MasterLookupResponse): FormState {
  if (tab === 'equipment') return { vendorId: lookups?.vendors[0]?.id ?? '', type: 'AA', unitNo: '', brand: '', model: '', aliases: '', scopeLS: true, scopeCL: true, active: true, reason: '' };
  if (tab === 'crushers') return { code: '', name: '', materialKind: 'LS', plantId: '', active: true, reason: '' };
  if (tab === 'sources') return { code: '', name: '', block: '', materialCategory: 'PILE', materialKind: 'LS', aliases: '', active: true, reason: '' };
  if (tab === 'piles') return { code: '', name: '', materialKind: 'LS', plantId: '', className: '', active: true, reason: '' };
  if (tab === 'vendors') return { code: '', name: '', contactEmail: '', aliases: '', scopeLS: true, scopeCL: true, active: true, reason: '' };
  return { code: '', name: '', scopeLS: true, scopeCL: true, active: true, reason: '' };
}

function formFromItem(tab: Tab, item: RowItem): FormState {
  if (tab === 'vendors') { const x = item as Vendor; return { code: x.code, name: x.name, contactEmail: x.contactEmail ?? '', aliases: aliasesToText(x.aliases), scopeLS:x.materialKinds.includes('LS'),scopeCL:x.materialKinds.includes('CL'), active: x.active, reason: '' }; }
  if (tab === 'equipment') { const x = item as Equipment; return { vendorId: x.vendorId, type: x.type, unitNo: x.unitNo, brand: x.brand ?? '', model: x.model ?? '', aliases: aliasesToText(x.aliases), scopeLS:x.materialKinds.includes('LS'),scopeCL:x.materialKinds.includes('CL'), active: x.active, reason: '' }; }
  if (tab === 'crushers') { const x = item as Crusher; return { code: x.code, name: x.name, materialKind: x.materialKind, plantId: x.plantId ?? '', active: x.active, reason: '' }; }
  if (tab === 'sources') { const x = item as Source; return { code: x.code, name: x.name, block: x.block ?? '', materialCategory: x.materialCategory, materialKind: x.materialKind, aliases: aliasesToText(x.aliases), active: x.active, reason: '' }; }
  if (tab === 'piles') { const x = item as Pile; return { code: x.code, name: x.name, materialKind: x.materialKind, plantId: x.plantId ?? '', className: x.className ?? '', active: x.active, reason: '' }; }
  const x = item as Plant; return { code: x.code, name: x.name, scopeLS:x.materialKinds.includes('LS'),scopeCL:x.materialKinds.includes('CL'), active: x.active, reason: '' };
}

function payloadFromForm(tab: Tab, form: FormState, editing: boolean) {
  const reason = String(form.reason ?? '').trim();
  const common = editing ? { active: Boolean(form.active), ...(reason ? { reason } : {}) } : {};
  const materialKinds=[...(form.scopeLS?['LS']:[]),...(form.scopeCL?['CL']:[])];
  if (tab === 'vendors') return { code: String(form.code), name: String(form.name), aliases: aliasesFromText(String(form.aliases)), contactEmail: nullable(String(form.contactEmail)), materialKinds, ...common };
  if (tab === 'equipment') return { vendorId: String(form.vendorId), type: String(form.type), unitNo: String(form.unitNo), brand: nullable(String(form.brand)), model: nullable(String(form.model)), aliases: aliasesFromText(String(form.aliases)), materialKinds, ...common };
  if (tab === 'crushers') return { code: String(form.code), name: String(form.name), materialKind: String(form.materialKind), plantId: nullable(String(form.plantId)), ...common };
  if (tab === 'sources') return { code: String(form.code), name: String(form.name), block: nullable(String(form.block)), materialCategory: String(form.materialCategory), materialKind: String(form.materialKind), aliases: aliasesFromText(String(form.aliases)), ...common };
  if (tab === 'piles') return { code: String(form.code), name: String(form.name), materialKind: String(form.materialKind), plantId: nullable(String(form.plantId)), className: nullable(String(form.className)), ...common };
  return { code: String(form.code), name: String(form.name), materialKinds, ...common };
}

function MasterDataPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('vendors');
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<'all' | 'true' | 'false'>('all');
  const [vendorFilter, setVendorFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; item: RowItem | null } | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [message, setMessage] = useState<string | null>(null);

  const { data: lookups } = useQuery(masterLookupQueryOptions());
  const params = useMemo(() => {
    const p = new URLSearchParams({ active, limit: '250', offset: '0' });
    if (search.trim()) p.set('search', search.trim());
    if (tab === 'equipment' && vendorFilter) p.set('vendorId', vendorFilter);
    if ((tab === 'vendors'||tab==='equipment'||tab==='plants'||tab === 'crushers' || tab === 'sources' || tab === 'piles') && kindFilter) p.set('materialKind', kindFilter);
    return p;
  }, [active, kindFilter, search, tab, vendorFilter]);
  const filterKey = params.toString();
  const listQuery = useQuery({
    queryKey: masterKeys.list(tab as MasterEntity, filterKey),
    queryFn: () => listMaster<RowItem>(tab as MasterEntity, params),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = payloadFromForm(tab, form, modal?.mode === 'edit');
      if (modal?.mode === 'edit' && modal.item) return updateMaster<RowItem>(tab as MasterEntity, modal.item.id, payload);
      return createMaster<RowItem>(tab as MasterEntity, payload);
    },
    onSuccess: async () => {
      setModal(null); setMessage('Master data berhasil disimpan.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: masterKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['lookups', 'master'] }),
        queryClient.invalidateQueries({ queryKey: ['equipment-lookup'] }),
        queryClient.invalidateQueries({ queryKey: masterKeys.lookups }),
      ]);
    },
  });

  function openCreate() { setMessage(null); setForm(defaultForm(tab, lookups)); setModal({ mode: 'create', item: null }); }
  function openEdit(item: RowItem) { setMessage(null); setForm(formFromItem(tab, item)); setModal({ mode: 'edit', item }); }
  function field(name: string, value: string | boolean) { setForm((current) => ({ ...current, [name]: value })); }

  const columns = useMemo<ColumnDef<RowItem>[]>(() => {
    const action: ColumnDef<RowItem> = { header: 'Aksi', cell: ({ row }) => <button className="btn small" type="button" onClick={() => openEdit(row.original)}>Edit</button> };
    if (tab === 'vendors') return [
      { header: 'Code', cell: ({ row }) => (row.original as Vendor).code }, { header: 'Vendor', cell: ({ row }) => <strong>{(row.original as Vendor).name}</strong> },
      { header: 'Alias', cell: ({ row }) => aliasesToText((row.original as Vendor).aliases) || '—' }, {header:'Material',cell:({row})=>(row.original as Vendor).materialKinds.join(' + ')}, { header: 'Email', cell: ({ row }) => (row.original as Vendor).contactEmail ?? '—' },
      { header: 'Status', cell: ({ row }) => activeLabel((row.original as Vendor).active) }, action,
    ];
    if (tab === 'equipment') return [
      { header: 'Vendor', cell: ({ row }) => (row.original as Equipment).vendorName }, { header: 'Type', cell: ({ row }) => <span className="code-chip">{(row.original as Equipment).type}</span> },
      { header: 'Unit', cell: ({ row }) => <strong>{(row.original as Equipment).unitNo}</strong> }, {header:'Material',cell:({row})=>(row.original as Equipment).materialKinds.join(' + ')}, { header: 'Brand / Model', cell: ({ row }) => `${(row.original as Equipment).brand ?? '—'} / ${(row.original as Equipment).model ?? '—'}` },
      { header: 'Status', cell: ({ row }) => activeLabel((row.original as Equipment).active) }, action,
    ];
    if (tab === 'crushers') return [
      { header: 'Code', cell: ({ row }) => (row.original as Crusher).code }, { header: 'Crusher', cell: ({ row }) => <strong>{(row.original as Crusher).name}</strong> },
      { header: 'Material', cell: ({ row }) => (row.original as Crusher).materialKind }, { header: 'Plant', cell: ({ row }) => (row.original as Crusher).plantName ?? '—' },
      { header: 'Status', cell: ({ row }) => activeLabel((row.original as Crusher).active) }, action,
    ];
    if (tab === 'sources') return [
      { header: 'Code', cell: ({ row }) => (row.original as Source).code }, { header: 'Source', cell: ({ row }) => <strong>{(row.original as Source).name}</strong> },
      { header: 'Block', cell: ({ row }) => (row.original as Source).block ?? '—' }, { header: 'Category', cell: ({ row }) => (row.original as Source).materialCategory },
      { header: 'Kind', cell: ({ row }) => (row.original as Source).materialKind }, { header: 'Status', cell: ({ row }) => activeLabel((row.original as Source).active) }, action,
    ];
    if (tab === 'piles') return [
      { header: 'Code', cell: ({ row }) => (row.original as Pile).code }, { header: 'Pile', cell: ({ row }) => <strong>{(row.original as Pile).name}</strong> },
      { header: 'Material', cell: ({ row }) => (row.original as Pile).materialKind }, { header: 'Plant', cell: ({ row }) => (row.original as Pile).plantName ?? '—' },
      { header: 'Class', cell: ({ row }) => (row.original as Pile).className ?? '—' }, { header: 'Status', cell: ({ row }) => activeLabel((row.original as Pile).active) }, action,
    ];
    return [
      { header: 'Code', cell: ({ row }) => (row.original as Plant).code }, { header: 'Plant', cell: ({ row }) => <strong>{(row.original as Plant).name}</strong> }, {header:'Material',cell:({row})=>(row.original as Plant).materialKinds.join(' + ')},
      { header: 'Status', cell: ({ row }) => activeLabel((row.original as Plant).active) }, action,
    ];
  }, [tab]);

  const currentTab = tabs.find((x) => x.id === tab)!;
  return (
    <section className="page-stack">
      <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION / MASTER DATA</p><h1>Master Data</h1><p>Kelola vendor, alat, sumber, dan tujuan produksi. Atur cakupan Limestone dan Clay pada setiap master.</p></div><button className="btn primary" type="button" onClick={openCreate}>+ Tambah {currentTab.label}</button></div>
      <div className="master-tabs">{tabs.map((x) => <button key={x.id} className={tab === x.id ? 'active' : ''} type="button" onClick={() => { setTab(x.id); setSearch(''); setVendorFilter(''); setKindFilter(''); }}>{x.label}<small>{x.hint}</small></button>)}</div>
      <div className="card toolbar-card">
        <input aria-label="Cari master data" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Cari ${currentTab.label.toLowerCase()}...`} />
        <select aria-label="Status master" value={active} onChange={(e) => setActive(e.target.value as 'all' | 'true' | 'false')}><option value="all">Semua Status</option><option value="true">Active</option><option value="false">Inactive</option></select>
        {tab === 'equipment' && <select value={vendorFilter} onChange={(e) => setVendorFilter(e.target.value)}><option value="">Semua Vendor</option>{lookups?.vendors.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>}
        <select aria-label="Material master" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)}><option value="">Semua material</option><option value="LS">Limestone</option><option value="CL">Clay</option></select>
        <span className="toolbar-meta">{listQuery.isFetching ? 'Memuat…' : `${listQuery.data?.total ?? 0} record`}</span>
      </div>
      {message && <div className="alert success">{message}</div>}
      {listQuery.error && <div className="alert error">{listQuery.error instanceof Error ? listQuery.error.message : 'Gagal memuat master data.'}</div>}
      <article className="card table-card"><DataTable data={listQuery.data?.items ?? []} columns={columns} /></article>

      {modal && <Modal title={`${modal.mode === 'create' ? 'Tambah' : 'Edit'} ${currentTab.label}`} subtitle={modal.mode === 'edit' ? 'Perubahan status membutuhkan alasan dan seluruh perubahan dicatat ke audit log.' : 'Gunakan canonical code yang stabil untuk integrasi antar modul.'} onClose={() => setModal(null)} footer={<><button className="btn" type="button" onClick={() => setModal(null)}>Batal</button><button className="btn primary" type="button" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>{saveMutation.isPending ? 'Menyimpan…' : 'Simpan'}</button></>}>
        <div className="form-grid">
          {tab !== 'equipment' && <label><span>Code</span><input value={String(form.code ?? '')} onChange={(e) => field('code', e.target.value)} /></label>}
          {tab !== 'equipment' && <label><span>Nama</span><input value={String(form.name ?? '')} onChange={(e) => field('name', e.target.value)} /></label>}
          {tab === 'vendors' && <><label><span>Contact Email</span><input type="email" value={String(form.contactEmail ?? '')} onChange={(e) => field('contactEmail', e.target.value)} /></label><label className="span-2"><span>Aliases — pisahkan koma</span><input value={String(form.aliases ?? '')} onChange={(e) => field('aliases', e.target.value)} /></label></>}
          {tab === 'equipment' && <><label><span>Vendor</span><select value={String(form.vendorId ?? '')} onChange={(e) => field('vendorId', e.target.value)}><option value="">— pilih vendor —</option>{lookups?.vendors.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label><label><span>Type</span><select value={String(form.type ?? 'AA')} onChange={(e) => field('type', e.target.value)}><option value="AM">AM — Alat Muat</option><option value="AA">AA — Alat Angkut</option></select></label><label><span>Unit No</span><input value={String(form.unitNo ?? '')} onChange={(e) => field('unitNo', e.target.value)} /></label><label><span>Brand</span><input value={String(form.brand ?? '')} onChange={(e) => field('brand', e.target.value)} /></label><label><span>Model</span><input value={String(form.model ?? '')} onChange={(e) => field('model', e.target.value)} /></label><label><span>Aliases</span><input value={String(form.aliases ?? '')} onChange={(e) => field('aliases', e.target.value)} /></label></>}
          {(tab === 'crushers' || tab === 'sources' || tab === 'piles') && <label><span>Material Kind</span><select value={String(form.materialKind ?? 'LS')} onChange={(e) => field('materialKind', e.target.value)}><option value="LS">LS — Limestone</option><option value="CL">CL — Clay</option></select></label>}
          {(tab === 'crushers' || tab === 'piles') && <label><span>Plant</span><select value={String(form.plantId ?? '')} onChange={(e) => field('plantId', e.target.value)}><option value="">— belum dipetakan —</option>{lookups?.plants.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>}
          {tab === 'sources' && <><label><span>Block</span><input value={String(form.block ?? '')} onChange={(e) => field('block', e.target.value)} /></label><label><span>Material Category</span><input list="material-category-options" value={String(form.materialCategory ?? 'PILE')} onChange={(e) => field('materialCategory', e.target.value)} /><datalist id="material-category-options">{(lookups?.materialCategories?.length ? lookups.materialCategories : ['PILE', 'FILLER']).map((x) => <option key={x} value={x} />)}</datalist></label><label className="span-2"><span>Aliases</span><input value={String(form.aliases ?? '')} onChange={(e) => field('aliases', e.target.value)} /></label></>}
          {tab === 'piles' && <label><span>Class</span><input value={String(form.className ?? '')} onChange={(e) => field('className', e.target.value)} /></label>}
          {(tab==='vendors'||tab==='equipment'||tab==='plants')&&<div className="span-2 inline-actions"><strong>Scope material:</strong><label><input type="checkbox" checked={Boolean(form.scopeLS)} onChange={e=>field('scopeLS',e.target.checked)}/> Limestone</label><label><input type="checkbox" checked={Boolean(form.scopeCL)} onChange={e=>field('scopeCL',e.target.checked)}/> Clay</label></div>}
          {modal.mode === 'edit' && <><label className="toggle-field"><span>Status</span><select value={Boolean(form.active) ? 'true' : 'false'} onChange={(e) => field('active', e.target.value === 'true')}><option value="true">ACTIVE</option><option value="false">INACTIVE</option></select></label><label className="span-2"><span>Alasan perubahan status / catatan audit</span><input value={String(form.reason ?? '')} onChange={(e) => field('reason', e.target.value)} placeholder="Wajib jika status berubah" /></label></>}
        </div>
        {saveMutation.error && <div className="alert error modal-alert">{saveMutation.error instanceof ApiClientError ? saveMutation.error.message : 'Gagal menyimpan master data.'}</div>}
      </Modal>}
    </section>
  );
}
