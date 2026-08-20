import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { authQueryKey } from '../../features/auth/auth-query';
import { ApiClientError, apiFetch } from '../../lib/api-client';

export const Route = createFileRoute('/_authenticated/security')({ component: SecurityPage });

function SecurityPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState('');

  const mutation = useMutation({
    mutationFn: () => apiFetch<{ ok: true; reauthenticationRequired: true }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
    onSuccess: async () => {
      router.options.context.queryClient.removeQueries({ queryKey: authQueryKey });
      await router.navigate({ to: '/login' });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setClientError('');
    if (newPassword !== confirmPassword) return setClientError('Konfirmasi password baru tidak sama.');
    if (newPassword.length < 12) return setClientError('Password baru minimal 12 karakter.');
    mutation.mutate();
  };

  const serverError = mutation.error instanceof ApiClientError ? mutation.error.message : '';

  return (
    <section className="page-stack narrow">
      <div className="page-heading"><div><p className="eyebrow">ACCOUNT SECURITY</p><h1>Ganti Password</h1><p>Setelah password diganti, seluruh session user akan direvoke dan login ulang diwajibkan.</p></div></div>
      <form className="card form-stack" onSubmit={submit}>
        <div><label>Password Saat Ini</label><input type="password" autoComplete="current-password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></div>
        <div><label>Password Baru</label><input type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={12} required /></div>
        <div><label>Konfirmasi Password Baru</label><input type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={12} required /></div>
        {(clientError || serverError) && <div className="alert error">{clientError || serverError}</div>}
        <div><button className="btn primary" disabled={mutation.isPending}>{mutation.isPending ? 'Menyimpan...' : 'Ganti Password'}</button></div>
      </form>
    </section>
  );
}
