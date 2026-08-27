import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import type { AuthSessionResponse, LoginResponse } from '@qc/contracts';
import { authQueryKey, authQueryOptions } from '../features/auth/auth-query';
import { ApiClientError, apiFetch } from '../lib/api-client';
import { AppIcon } from '../components/app-icon';

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
  const [showPassword, setShowPassword] = useState(false);

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
    <div className="login-page workspace-login">
      <section className="login-story" aria-label="QC Raw Material">
        <div className="login-wordmark"><span className="app-logo">q<span>c</span><i /></span><span>Raw Material<small>SEMEN TONASA</small></span></div>
        <div className="login-story-content"><p>QUALITY IN EVERY LAYER</p><h2>Mutu yang terjaga.<br /><span>Operasi yang terarah.</span></h2><p>Satu ruang kerja untuk memastikan kualitas bahan baku, dari sumber material hingga hasil mixing.</p><div className="login-materials"><span><AppIcon name="limestone" size={24} />Limestone</span><span><AppIcon name="clay" size={24} />Clay</span></div></div>
        <small>Raw Material Operations · Quality Control</small>
      </section>
      <section className="login-panel">
        <div className="login-brand"><div><p className="eyebrow">SELAMAT DATANG KEMBALI</p><h1>Masuk ke workspace</h1><p>Gunakan akun Anda untuk melanjutkan pekerjaan.</p></div></div>
        <form className="login-form" onSubmit={(event) => { event.preventDefault(); login.mutate(); }}>
          <div><label htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} minLength={3} required autoFocus /></div>
          <div><label htmlFor="password">Password</label><div className="password-field"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required /><button type="button" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Sembunyikan' : 'Lihat'}</button></div></div>
          {errorMessage && <div className="alert error" role="alert">{errorMessage}</div>}
          <button className="btn primary full" type="submit" disabled={login.isPending}>{login.isPending ? 'Memverifikasi...' : 'Masuk workspace'}<AppIcon name="arrow" size={18} /></button>
        </form>
        <p className="login-footnote"><AppIcon name="shield" size={15} /> Akses aman untuk pengguna terdaftar.</p>
      </section>
    </div>
  );
}
