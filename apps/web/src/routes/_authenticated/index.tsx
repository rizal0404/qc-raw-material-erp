import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { authQueryOptions } from '../../features/auth/auth-query';

export const Route = createFileRoute('/_authenticated/')({ component: HomePage });

function HomePage() {
  const { data } = useQuery(authQueryOptions);
  if (!data?.authenticated) return null;
  const { user, session } = data;
  return (
    <section className="page-stack">
      <div className="page-heading">
        <div><p className="eyebrow">FOUNDATION / IAM</p><h1>QC Raw Material Native Web</h1><p>Authentication dan server-side RBAC aktif. Modul bisnis ditambahkan sebagai vertical slice berikutnya.</p></div>
        <span className="status-badge success">SESSION ACTIVE</span>
      </div>
      <div className="grid-3">
        <article className="card"><span className="card-label">USER</span><strong>{user.displayName}</strong><small>@{user.username}</small></article>
        <article className="card"><span className="card-label">ROLE</span><strong>{user.role}</strong><small>Authorization diverifikasi backend.</small></article>
        <article className="card"><span className="card-label">SESSION EXPIRES</span><strong>{new Date(session.expiresAt).toLocaleString('id-ID')}</strong><small>Opaque HttpOnly session cookie.</small></article>
      </div>
      <article className="card">
        <h2>Scope saat ini</h2>
        <dl className="definition-grid">
          <div><dt>Vendor ID</dt><dd>{user.vendorId ?? '—'}</dd></div>
          <div><dt>Crusher Scope</dt><dd>{user.crusherIds.length ? user.crusherIds.join(', ') : '— / global sesuai role'}</dd></div>
          <div><dt>Last Login</dt><dd>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('id-ID') : '—'}</dd></div>
        </dl>
      </article>
    </section>
  );
}
