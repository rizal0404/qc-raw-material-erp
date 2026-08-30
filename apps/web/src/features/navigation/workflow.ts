import type { MaterialKind, Role } from '@qc/contracts';

export const materialNames: Record<MaterialKind, string> = { LS: 'Limestone', CL: 'Clay' };
export const roleLabels: Record<Role, string> = {
  VENDOR: 'Vendor', CRUSHER_OPERATOR: 'Operator Crusher', QC_ANALYST: 'QC Analyst', SUPERVISOR_ADMIN: 'Supervisor / Admin',
};

export type PagePath = '/' | '/vendor-shift-report' | '/clay-report' | '/retase-counter' | '/raw-samples' | '/reconciliation' | '/qc-workbench' | '/qc-reports' | '/peta-mutu' | '/master-data' | '/user-management' | '/security';
export type NavIcon = 'overview' | 'limestone' | 'clay' | 'report' | 'truck' | 'sample' | 'reconcile' | 'mix' | 'chart' | 'map' | 'database' | 'users' | 'shield' | 'arrow' | 'chevron' | 'panel' | 'menu' | 'close' | 'logout' | 'calendar' | 'check';
export interface NavItem { to: PagePath; label: string; icon: NavIcon }

export function validateMaterialSearch(search: Record<string, unknown>): { material?: MaterialKind } {
  return search.material === 'LS' || search.material === 'CL' ? { material: search.material } : {};
}

export function materialForPath(pathname: string, material?: MaterialKind): MaterialKind {
  if (pathname === '/clay-report') return 'CL';
  return material ?? 'LS';
}

export function workflowNavigation(role: Role, material: MaterialKind): NavItem[] {
  const items: NavItem[] = [];
  if (material === 'CL' && role !== 'VENDOR') items.push({ to: '/clay-report', label: 'Laporan Crusher', icon: 'report' });
  if (role !== 'CRUSHER_OPERATOR') items.push({ to: '/vendor-shift-report', label: material === 'CL' ? 'Laporan Vendor · opsional' : 'Laporan Shift Vendor', icon: 'truck' });
  if (material === 'LS' && role !== 'VENDOR') items.push({ to: '/retase-counter', label: role === 'QC_ANALYST' ? 'Retase · Laporan Foto' : 'Retase Counter', icon: 'truck' });
  if (role === 'QC_ANALYST' || role === 'SUPERVISOR_ADMIN') items.push(
    { to: '/raw-samples', label: 'Sampel Laboratorium', icon: 'sample' },
    ...(material === 'LS' ? [{ to: '/reconciliation', label: 'Rekonsiliasi Retase', icon: 'reconcile' } as NavItem] : []),
    { to: '/qc-workbench', label: 'Mixing Workbench', icon: 'mix' },
    { to: '/qc-reports', label: 'Laporan QC', icon: 'chart' },
    { to: '/peta-mutu', label: 'Peta Mutu', icon: 'map' },
  );
  return items;
}

export function entryFor(role: Role, material: MaterialKind): PagePath {
  if (material === 'CL' && role !== 'VENDOR') return '/clay-report';
  if (role === 'QC_ANALYST') return '/qc-workbench';
  if (role === 'CRUSHER_OPERATOR') return '/retase-counter';
  return '/vendor-shift-report';
}

export const sharedNavigation: NavItem[] = [
  { to: '/master-data', label: 'Master Data', icon: 'database' },
  { to: '/user-management', label: 'Manajemen Pengguna', icon: 'users' },
  { to: '/security', label: 'Keamanan Akun', icon: 'shield' },
];

export function isMaterialPage(pathname: string) {
  return pathname !== '/' && !sharedNavigation.some(item => item.to === pathname);
}

export function pageLabel(pathname: string): string {
  if (pathname === '/') return 'Ringkasan';
  return [...workflowNavigation('SUPERVISOR_ADMIN', 'LS'), ...workflowNavigation('SUPERVISOR_ADMIN', 'CL'), ...sharedNavigation].find(item => item.to === pathname)?.label ?? 'Ruang kerja';
}
