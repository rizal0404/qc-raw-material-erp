import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import type { Role, UserListItem } from '@qc/contracts';
import { DataTable } from '../../components/data-table';
import { Modal } from '../../components/modal';
import { authQueryOptions } from '../../features/auth/auth-query';
import { masterLookupQueryOptions } from '../../features/master/master-api';
import { apiFetch, ApiClientError } from '../../lib/api-client';

export const Route = createFileRoute('/_authenticated/user-management')({
  beforeLoad: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(authQueryOptions);
    if (!auth.authenticated || auth.user.role !== 'SUPERVISOR_ADMIN') throw redirect({ to: '/' });
  },
  component: UserManagementPage,
});

type UsersResponse = { ok: true; users: UserListItem[] };
type UserMutationResponse = { ok: true; user: UserListItem };
type FormState = { username: string; displayName: string; password: string; role: Role; vendorId: string; crusherIds: string[]; reason: string };
const emptyForm: FormState = { username: '', displayName: '', password: '', role: 'QC_ANALYST', vendorId: '', crusherIds: [], reason: '' };

function UserManagementPage() {
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ['iam', 'users'], queryFn: () => apiFetch<UsersResponse>('/iam/users') });
  const { data: lookups } = useQuery(masterLookupQueryOptions());
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; user?: UserListItem } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (modal?.mode === 'create') {
        return apiFetch<UserMutationResponse>('/iam/users', { method: 'POST', body: JSON.stringify({
          username: form.username, displayName: form.displayName, password: form.password, role: form.role,
          vendorId: form.role === 'VENDOR' ? form.vendorId || null : null,
          crusherIds: form.role === 'CRUSHER_OPERATOR' ? form.crusherIds : [],
        }) });
      }
      return apiFetch<UserMutationResponse>(`/iam/users/${modal!.user!.id}`, { method: 'PATCH', body: JSON.stringify({
        displayName: form.displayName, role: form.role,
        vendorId: form.role === 'VENDOR' ? form.vendorId || null : null,
        crusherIds: form.role === 'CRUSHER_OPERATOR' ? form.crusherIds : [],
        reason: form.reason,
      }) });
    },
    onSuccess: async () => { setModal(null); setMessage('User berhasil disimpan.'); await qc.invalidateQueries({ queryKey: ['iam', 'users'] }); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ user, status }: { user: UserListItem; status: 'ACTIVE' | 'DEACTIVATED' }) => apiFetch<UserMutationResponse>(`/iam/users/${user.id}/status`, { method: 'PATCH', body: JSON.stringify({ status, reason: status === 'ACTIVE' ? 'Aktivasi user dari User Management' : 'Deaktivasi user dari User Management' }) }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['iam', 'users'] }); },
  });

  function openCreate() { setForm(emptyForm); setModal({ mode: 'create' }); setMessage(null); }
  function openEdit(user: UserListItem) { setForm({ username: user.username, displayName: user.displayName, password: '', role: user.role, vendorId: user.vendorId ?? '', crusherIds: user.crusherIds, reason: '' }); setModal({ mode: 'edit', user }); setMessage(null); }
  function toggleCrusher(id: string) { setForm((f) => ({ ...f, crusherIds: f.crusherIds.includes(id) ? f.crusherIds.filter((x) => x !== id) : [...f.crusherIds, id] })); }

  const columns = useMemo<ColumnDef<UserListItem>[]>(() => [
    { header: 'User', cell: ({ row }) => <div><strong>{row.original.displayName}</strong><small className="table-sub">@{row.original.username}</small></div> },
    { header: 'Role', cell: ({ row }) => <span className="code-chip">{row.original.role}</span> },
    { header: 'Vendor', cell: ({ row }) => lookups?.vendors.find((v) => v.id === row.original.vendorId)?.label ?? '—' },
    { header: 'Crusher Scope', cell: ({ row }) => row.original.crusherIds.length ? row.original.crusherIds.map((id) => lookups?.crushers.find((c) => c.id === id)?.code ?? id).join(', ') : '—' },
    { header: 'Last Login', cell: ({ row }) => row.original.lastLoginAt ? new Date(row.original.lastLoginAt).toLocaleString('id-ID') : '—' },
    { header: 'Status', cell: ({ row }) => <span className={`status-badge ${row.original.status === 'ACTIVE' ? 'success' : 'muted'}`}>{row.original.status}</span> },
    { header: 'Aksi', cell: ({ row }) => <div className="inline-actions"><button className="btn small" type="button" onClick={() => openEdit(row.original)}>Edit</button><button className="btn small" type="button" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate({ user: row.original, status: row.original.status === 'ACTIVE' ? 'DEACTIVATED' : 'ACTIVE' })}>{row.original.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></div> },
  ], [lookups, statusMutation.isPending]);

  return <section className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">ADMINISTRATION / IAM</p><h1>Manajemen Pengguna</h1><p>Kelola akun, peran, dan akses vendor atau crusher sesuai tanggung jawab pengguna.</p></div><button className="btn primary" type="button" onClick={openCreate}>+ Tambah User</button></div>
    {message && <div className="alert success">{message}</div>}
    {users.error && <div className="alert error">{users.error instanceof Error ? users.error.message : 'Gagal memuat user.'}</div>}
    <article className="card table-card"><DataTable data={users.data?.users ?? []} columns={columns} /></article>

    {modal && <Modal title={modal.mode === 'create' ? 'Tambah User' : 'Edit User'} subtitle="Tentukan peran dan akses operasional pengguna." onClose={() => setModal(null)} footer={<><button className="btn" type="button" onClick={() => setModal(null)}>Batal</button><button className="btn primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Menyimpan…' : 'Simpan'}</button></>}>
      <div className="form-grid">
        <label><span>Username</span><input disabled={modal.mode === 'edit'} value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} /></label>
        <label><span>Display Name</span><input value={form.displayName} onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))} /></label>
        {modal.mode === 'create' && <label className="span-2"><span>Initial Password — minimum 12 karakter</span><input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} /></label>}
        <label><span>Role</span><select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role, vendorId: '', crusherIds: [] }))}><option value="VENDOR">VENDOR</option><option value="CRUSHER_OPERATOR">CRUSHER_OPERATOR</option><option value="QC_ANALYST">QC_ANALYST</option><option value="SUPERVISOR_ADMIN">SUPERVISOR_ADMIN</option></select></label>
        {form.role === 'VENDOR' && <label><span>Vendor Scope</span><select value={form.vendorId} onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}><option value="">— pilih vendor —</option>{lookups?.vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>}
        {form.role === 'CRUSHER_OPERATOR' && <div className="span-2"><span className="field-label">Crusher Scope</span><div className="checkbox-grid">{lookups?.crushers.map((c) => <label key={c.id} className="check-card"><input type="checkbox" checked={form.crusherIds.includes(c.id)} onChange={() => toggleCrusher(c.id)} /><span><strong>{c.label}</strong><small>{c.code} · {c.materialKind}</small></span></label>)}</div></div>}
        {modal.mode === 'edit' && <label className="span-2"><span>Alasan Perubahan</span><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Wajib untuk update access" /></label>}
      </div>
      {save.error && <div className="alert error modal-alert">{save.error instanceof ApiClientError ? save.error.message : 'Gagal menyimpan user.'}</div>}
    </Modal>}
  </section>;
}
