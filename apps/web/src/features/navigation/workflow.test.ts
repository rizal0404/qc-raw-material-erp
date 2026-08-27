import { describe, expect, it } from 'vitest';
import { entryFor, isMaterialPage, materialForPath, validateMaterialSearch, workflowNavigation } from './workflow';
import { equipmentLookupQueryOptions } from '../master/master-api';

describe('material workspace navigation', () => {
  it('accepts only explicit material kinds and preserves legacy Limestone defaults', () => {
    expect(validateMaterialSearch({ material: 'CL', other: 'ignored' })).toEqual({ material: 'CL' });
    expect(validateMaterialSearch({ material: 'LS' })).toEqual({ material: 'LS' });
    for (const material of [undefined, null, 'cl', 'all', ['LS'], {}]) expect(validateMaterialSearch({ material })).toEqual({});
    expect(materialForPath('/raw-samples')).toBe('LS');
    expect(materialForPath('/qc-workbench', 'CL')).toBe('CL');
    expect(materialForPath('/clay-report', 'LS')).toBe('CL');
  });
  it('gives Clay an independent primary report and no dependency on the Limestone counter', () => {
    const clay = workflowNavigation('SUPERVISOR_ADMIN', 'CL');
    const limestone = workflowNavigation('SUPERVISOR_ADMIN', 'LS');
    expect(clay[0]?.to).toBe('/clay-report');
    expect(clay.some(item => item.to === '/retase-counter')).toBe(false);
    expect(clay.some(item => item.to === '/reconciliation')).toBe(false);
    expect(limestone.some(item => item.to === '/reconciliation')).toBe(true);
    expect(clay.find(item => item.to === '/vendor-shift-report')?.label).toContain('opsional');
    expect(limestone.some(item => item.to === '/clay-report')).toBe(false);
    expect(limestone.some(item => item.to === '/retase-counter')).toBe(true);
  });
  it('keeps role-specific entry points and hides unauthorized modules', () => {
    for (const kind of ['LS', 'CL'] as const) {
      expect(workflowNavigation('VENDOR', kind).map(item => item.to)).toEqual(['/vendor-shift-report']);
      for (const role of ['VENDOR', 'CRUSHER_OPERATOR', 'QC_ANALYST', 'SUPERVISOR_ADMIN'] as const) {
        expect(workflowNavigation(role, kind).some(item => item.to === entryFor(role, kind))).toBe(true);
      }
    }
    expect(workflowNavigation('CRUSHER_OPERATOR', 'LS').map(item => item.to)).toEqual(['/retase-counter']);
    expect(workflowNavigation('CRUSHER_OPERATOR', 'CL').map(item => item.to)).toEqual(['/clay-report']);
  });
  it('separates equipment caches for the same vendor and type by material', () => {
    const ls = equipmentLookupQueryOptions('shared-vendor', 'AM', 'LS');
    const cl = equipmentLookupQueryOptions('shared-vendor', 'AM', 'CL');
    expect(ls.queryKey).not.toEqual(cl.queryKey);
    expect(ls.queryKey).toContain('LS');
    expect(cl.queryKey).toContain('CL');
  });
  it('keeps account and administration outside the material workflow', () => {
    for (const path of ['/', '/master-data', '/security', '/user-management']) expect(isMaterialPage(path)).toBe(false);
    for (const path of ['/raw-samples', '/reconciliation', '/qc-reports', '/peta-mutu']) expect(isMaterialPage(path)).toBe(true);
  });
});
