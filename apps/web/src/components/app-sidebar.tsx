import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import type { AuthUser, MaterialKind } from '@qc/contracts';
import { AppIcon } from './app-icon';
import { isMaterialPage, materialNames, roleLabels, sharedNavigation, workflowNavigation } from '../features/navigation/workflow';

interface Props {
  user: AuthUser; pathname: string; material: MaterialKind; collapsed: boolean; mobile: boolean; mobileOpen: boolean;
  onCollapse: () => void; onClose: () => void; onLogout: () => void; loggingOut: boolean;
}

export function AppSidebar({ user, pathname, material, collapsed, mobile, mobileOpen, onCollapse, onClose, onLogout, loggingOut }: Props) {
  const [groups, setGroups] = useState<Record<MaterialKind, boolean>>({ LS: isMaterialPage(pathname) && material === 'LS', CL: isMaterialPage(pathname) && material === 'CL' });
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => {
    if (isMaterialPage(pathname)) setGroups({ LS: material === 'LS', CL: material === 'CL' });
    const frame = requestAnimationFrame(() => sidebar.current?.querySelector('.sidebar-navigation')?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [pathname, material]);

  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar.current?.querySelector<HTMLButtonElement>('.mobile-close')?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const elements = [...(sidebar.current?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [])].filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trapFocus);
    return () => { document.body.style.overflow = bodyOverflow; document.removeEventListener('keydown', trapFocus); previous?.focus(); };
  }, [mobile, mobileOpen, onClose]);

  const rail = collapsed && !mobile;
  return <>
    {mobile && mobileOpen && <div className="sidebar-scrim" onClick={onClose} aria-hidden="true" />}
    <aside ref={sidebar} id="app-sidebar" className={`app-sidebar ${mobileOpen ? 'is-open' : ''}`} inert={mobile && !mobileOpen} role={mobile && mobileOpen ? 'dialog' : undefined} aria-modal={mobile && mobileOpen ? true : undefined} aria-label="Navigasi aplikasi">
      <div className="sidebar-brand">
        <Link to="/" search={{}} className="brand-link" onClick={onClose} aria-label="QC Raw Material · Ringkasan">
          <span className="app-logo">q<span>c</span><i /></span>
          {!rail && <span className="brand-name">Raw Material<small>SEMEN TONASA</small></span>}
        </Link>
        <button className="sidebar-icon mobile-close" onClick={onClose} aria-label="Tutup menu"><AppIcon name="close" /></button>
      </div>
      <div className="sidebar-workspace"><span className="workspace-dot" />{!rail && <><span>Quality Control<small>Ruang kerja operasional</small></span><span className="workspace-tag">QC</span></>}</div>
      <nav className="sidebar-navigation" aria-label="Menu utama">
        <Link to="/" search={{}} className={`sidebar-link ${pathname === '/' ? 'is-active' : ''}`} aria-current={pathname === '/' ? 'page' : undefined} aria-label="Ringkasan" title={rail ? 'Ringkasan' : undefined} onClick={onClose}><AppIcon name="overview" />{!rail && <span>Ringkasan</span>}</Link>
        <p className="sidebar-caption">{rail ? 'ALUR' : 'WORKFLOW MATERIAL'}</p>
        {(['LS', 'CL'] as const).map(kind => <div key={kind} className={`sidebar-group material-${kind.toLowerCase()}`}>
          <button className={`sidebar-group-toggle ${isMaterialPage(pathname) && material === kind ? 'current-workflow' : ''}`} aria-label={`Menu ${materialNames[kind]}`} aria-expanded={!rail && groups[kind]} aria-controls={`nav-${kind}`} title={rail ? materialNames[kind] : undefined} onClick={() => { if (rail) { onCollapse(); setGroups(current => ({ ...current, [kind]: true })); } else setGroups(current => ({ ...current, [kind]: !current[kind] })); }}>
            <AppIcon name={kind === 'LS' ? 'limestone' : 'clay'} />{!rail && <><span>{materialNames[kind]}</span><small>{kind}</small><span className={`group-chevron ${groups[kind] ? 'expanded' : ''}`}><AppIcon name="chevron" size={13} /></span></>}
          </button>
          <div id={`nav-${kind}`} className="sidebar-subnav" hidden={rail || !groups[kind]}>
            {workflowNavigation(user.role, kind).map(item => {
              const active = pathname === item.to && material === kind;
              return <Link key={item.to} to={item.to} search={{ material: kind }} className={`sidebar-link ${active ? 'is-active' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClose}><AppIcon name={item.icon} size={17} /><span>{item.label}</span>{active && <i className="nav-active-dot" />}</Link>;
            })}
          </div>
        </div>)}
        <p className="sidebar-caption">{rail ? 'AKUN' : 'PENGELOLAAN'}</p>
        {sharedNavigation.filter(item => item.to === '/security' || user.role === 'SUPERVISOR_ADMIN').map(item => <Link key={item.to} to={item.to} search={{}} className={`sidebar-link ${pathname === item.to ? 'is-active' : ''}`} aria-current={pathname === item.to ? 'page' : undefined} aria-label={item.label} title={rail ? item.label : undefined} onClick={onClose}><AppIcon name={item.icon} size={19} />{!rail && <span>{item.label}</span>}</Link>)}
      </nav>
      <div className="sidebar-bottom">
        <button type="button" className="sidebar-collapse" aria-label={rail ? 'Perluas sidebar' : 'Ciutkan sidebar'} aria-expanded={!rail} aria-controls="app-sidebar" onClick={onCollapse} title={rail ? 'Perluas sidebar' : undefined}><AppIcon name="panel" size={19} />{!rail && <span>Ciutkan sidebar</span>}</button>
        <div className="sidebar-account"><span className="user-avatar" title={user.displayName}>{user.displayName.split(' ').slice(0, 2).map(word => word[0]).join('').toUpperCase()}</span>{!rail && <span className="account-name">{user.displayName}<small>{roleLabels[user.role]}</small></span>}<button type="button" className="sidebar-icon logout-button" title="Keluar dari akun" aria-label="Keluar dari akun" disabled={loggingOut} onClick={onLogout}><AppIcon name="logout" size={18} /></button></div>
      </div>
    </aside>
  </>;
}
