import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { AuthSessionResponse, LoginResponse } from '@qc/contracts';
import { authQueryKey, authQueryOptions } from '../features/auth/auth-query';
import { ApiClientError, apiFetch } from '../lib/api-client';

export const Route = createFileRoute('/login')({
  beforeLoad: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(authQueryOptions);
    if (auth.authenticated) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
    onSuccess: async (data) => {
      const session: AuthSessionResponse = { ...data, authenticated: true };
      router.options.context.queryClient.setQueryData(authQueryKey, session);
      await router.navigate({ to: '/' });
    },
  });

  const errorMessage = login.error instanceof ApiClientError ? login.error.message : login.error ? 'Login gagal. Silakan coba kembali.' : '';

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-brand"><div className="brand-mark large">QC</div><div><p className="eyebrow">SEMEN TONASA</p><h1>QC Raw Material</h1><p>Vendor fleet, retase, reconciliation dan QC workbench dalam satu data chain.</p></div></div>
        <form className="login-form" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
          <div><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required autoFocus /></div>
          <div><label htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /></div>
          {errorMessage && <div className="alert error" role="alert">{errorMessage}</div>}
          <button className="btn primary full" type="submit" disabled={login.isPending}>{login.isPending ? 'Memverifikasi...' : 'Login'}</button>
        </form>
        <p className="login-footnote">Akses hanya untuk user terdaftar dan berstatus aktif.</p>
      </section>
    </div>
  );
}
