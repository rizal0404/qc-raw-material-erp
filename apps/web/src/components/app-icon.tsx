import type { NavIcon } from '../features/navigation/workflow';

const paths: Record<NavIcon, string> = {
  overview: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  limestone: 'M2 20 10 5l5 9 3-5 4 11H2 M7 11l3 2 3-2',
  clay: 'm12 3 10 5-10 5L2 8l10-5 M2 12l10 5 10-5 M2 16l10 5 10-5',
  report: 'M14 2H5v20h14V7l-5-5v5h5 M8 12h8 M8 16h8',
  truck: 'M2 5h12v12H2z M14 9h4l4 5v3h-8 M6 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4',
  sample: 'M9 3h6 M10 3v6L4 19q-1 2 2 2h12q3 0 2-2L14 9V3 M7 15h10',
  reconcile: 'M4 7h15l-4-4 M20 17H5l4 4 M4 7v5 M20 17v-5',
  mix: 'M4 7h16 M4 17h16 M8 3v8 M16 13v8',
  chart: 'M4 3v18h17 M9 16v-5 M14 16V7 M19 16v-8',
  map: 'm3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5 M9 3v16 M15 5v16',
  database: 'M20 5c0 4-16 4-16 0s16-4 16 0v14c0 4-16 4-16 0V5 M4 12c0 4 16 4 16 0',
  users: 'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M2 21v-3c0-5 14-5 14 0v3 M17 4c5 0 5 7 0 7 M19 15c3 0 3 3 3 6',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6l-9-4 M8 12l3 3 5-6',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  chevron: 'm8 4 8 8-8 8',
  panel: 'M3 3h18v18H3z M9 3v18 M16 8l-4 4 4 4',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'm6 6 12 12 M6 18 18 6',
  logout: 'M9 3H3v18h6 M9 12h12 M16 7l5 5-5 5',
  calendar: 'M3 5h18v16H3z M7 2v6 M17 2v6 M3 11h18 M7 15h2 M13 15h2',
  check: 'm5 12 4 4L19 6',
};
export function AppIcon({ name, size = 20 }: { name: NavIcon; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
