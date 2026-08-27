import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, Outlet, redirect, useLocation, useRouter } from '@tanstack/react-router';
import { AppSidebar } from '../components/app-sidebar';
import { AppIcon } from '../components/app-icon';
import { MaterialBadge, MaterialContext } from '../features/navigation/material-context';
import { isMaterialPage, materialForPath, materialNames, pageLabel, validateMaterialSearch } from '../features/navigation/workflow';
import { authQueryKey, authQueryOptions } from '../features/auth/auth-query';
import { apiFetch } from '../lib/api-client';

export const Route = createFileRoute('/_authenticated')({
  validateSearch: validateMaterialSearch,
  beforeLoad: async ({ context }) => {
    const auth = await context.queryClient.ensureQueryData(authQueryOptions);
    if (!auth.authenticated) throw redirect({ to: '/login' });
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { data } = useQuery(authQueryOptions);
  const router = useRouter();
  const { pathname, href } = useLocation();
  const search = Route.useSearch();
  const material = materialForPath(pathname, search.material);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('qc.sidebar.collapsed') === 'true'; } catch { return false; } });
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMenu = useCallback(() => setMobileOpen(false), []);
  useEffect(() => { setMobileOpen(false); }, [href]);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => { setMobile(media.matches); setMobileOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => { try { localStorage.setItem('qc.sidebar.collapsed', String(collapsed)); } catch { /* Preference storage is optional. */ } }, [collapsed]);
  useEffect(() => { document.title = `${pageLabel(pathname)}${isMaterialPage(pathname) ? ` · ${materialNames[material]}` : ''} | QC Raw Material`; }, [pathname, material]);
  const logout = useMutation({
    mutationFn: () => apiFetch<{ ok: true }>('/auth/logout', { method: 'POST' }),
    onSuccess: async () => {
      router.options.context.queryClient.clear();
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
    <MaterialContext.Provider value={material}>
      <div className={`app-shell workspace-shell ${collapsed ? 'sidebar-is-collapsed' : ''} material-${isMaterialPage(pathname) ? material.toLowerCase() : 'ls'}`}>
        <a className="skip-link" href="#main-content">Langsung ke konten</a>
        {user && <AppSidebar user={user} pathname={pathname} material={material} collapsed={collapsed} mobile={mobile} mobileOpen={mobileOpen} onCollapse={() => setCollapsed(value => !value)} onClose={closeMenu} onLogout={() => logout.mutate()} loggingOut={logout.isPending} />}
        <div className="workspace-body" inert={mobile && mobileOpen}>
          <header className="workspace-topbar">
            <button className="mobile-menu-button" type="button" aria-label="Buka menu" aria-expanded={mobileOpen} aria-controls="app-sidebar" onClick={() => setMobileOpen(true)}><AppIcon name="menu" /></button>
            <nav className="breadcrumbs" aria-label="Breadcrumb"><Link to="/" search={{}}>Workspace</Link><AppIcon name="chevron" size={12} />{isMaterialPage(pathname) && <><span>{materialNames[material]}</span><AppIcon name="chevron" size={12} /></>}<strong>{pageLabel(pathname)}</strong></nav>
            <div className="topbar-context">{isMaterialPage(pathname) && <MaterialBadge />}<span className="timezone-label">WITA <span>UTC+8</span></span></div>
          </header>
          <main id="main-content" className="workspace-main" tabIndex={-1}>
            {logout.isError && <div className="alert error" role="alert">Gagal keluar. Silakan coba kembali.</div>}
            <Outlet key={material} />
          </main>
          <footer className="workspace-footer"><span>QC Raw Material <i /> Semen Tonasa</span><span>Quality in every layer.</span></footer>
        </div>
      </div>
    </MaterialContext.Provider>
  );
}
