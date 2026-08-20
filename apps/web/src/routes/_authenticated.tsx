import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useRouter } from '@tanstack/react-router';
import type { Role } from '@qc/contracts';
import { authQueryKey, authQueryOptions } from '../features/auth/auth-query';
import { apiFetch } from '../lib/api-client';

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(authQueryOptions);
    if (!auth.authenticated) throw redirect({ to: '/login' });
  },
  component: AuthenticatedLayout,
});

const roleLabels: Record<Role, string> = {
  VENDOR: 'Vendor',
  CRUSHER_OPERATOR: 'Crusher Operator',
  QC_ANALYST: 'QC Analyst',
  SUPERVISOR_ADMIN: 'Supervisor / Admin',
};

function roleModules(role: Role): string[] {
  if (role === 'VENDOR') return ['Shift Report', 'History'];
  if (role === 'CRUSHER_OPERATOR') return ['Retase Counter', 'Shift Summary'];
  if (role === 'QC_ANALYST') return ['QC Workbench', 'Reconciliation', 'Reporting'];
  return ['Operations', 'Reconciliation', 'Reporting', 'Master Data', 'User Management'];
}

function AuthenticatedLayout() {
  const { data } = useQuery(authQueryOptions);
  const router = useRouter();
  const logout = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      router.options.context.queryClient.removeQueries({ queryKey: authQueryKey });
      await router.navigate({ to: '/login' });
    },
  });
  const user = data?.user;

  useEffect(() => {
    const handleExpired = () => {
      router.options.context.queryClient.removeQueries({ queryKey: authQueryKey });
      void router.navigate({ to: '/login' });
    };
    window.addEventListener('qc:auth-expired', handleExpired);
    return () => window.removeEventListener('qc:auth-expired', handleExpired);
  }, [router]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">QC</div>
          <div><strong>QC Raw Material</strong><small>Native Web</small></div>
        </div>
        <nav className="main-nav"><Link to="/">Home</Link>{(user?.role === 'VENDOR' || user?.role === 'QC_ANALYST' || user?.role === 'SUPERVISOR_ADMIN') && <Link to="/vendor-shift-report">Shift Report</Link>}{(user?.role === 'CRUSHER_OPERATOR' || user?.role === 'SUPERVISOR_ADMIN') && <Link to="/retase-counter">Retase Counter</Link>}{(user?.role === 'QC_ANALYST' || user?.role === 'SUPERVISOR_ADMIN') && <><Link to="/raw-samples">Samples</Link><Link to="/reconciliation">Reconciliation</Link><Link to="/qc-workbench">Workbench</Link><Link to="/qc-reports">QC Reports</Link></>}<Link to="/security">Security</Link>{user?.role === 'SUPERVISOR_ADMIN' && <><Link to="/master-data">Master Data</Link><Link to="/user-management">Users</Link></>}</nav>
        <div className="session-block">
          {user && <div className="user-chip"><span>{user.displayName}</span><small>{roleLabels[user.role]}</small></div>}
          <button className="btn ghost" type="button" disabled={logout.isPending} onClick={() => logout.mutate()}>{logout.isPending ? 'Keluar...' : 'Logout'}</button>
        </div>
      </header>
      {user && (
        <div className="module-strip">
          {roleModules(user.role).map((module) => <span key={module}>{module}</span>)}
        </div>
      )}
      <main><Outlet /></main>
    </div>
  );
}
