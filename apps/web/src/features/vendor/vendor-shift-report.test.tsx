// @vitest-environment jsdom
import type { ComponentType } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MasterLookupResponse, ShiftReport, ShiftReportDraftInput } from '@qc/contracts';
import { Route } from '../../routes/_authenticated/vendor-shift-report';
import * as api from './vendor-api';
import { createMaster } from '../master/master-api';
import { useMaterialLookups } from '../navigation/material-context';

vi.mock('@tanstack/react-router', () => ({ createFileRoute: () => (options: unknown) => ({ options }) }));
vi.mock('../master/master-api', () => ({ createMaster: vi.fn() }));
vi.mock('../navigation/use-draft-guard', () => ({ useDraftGuard: vi.fn() }));
vi.mock('../navigation/material-context', () => ({ useMaterial: () => 'LS', useMaterialLookups: vi.fn() }));
vi.mock('./vendor-api', () => ({ createShiftReport: vi.fn(), createShiftReportRevision: vi.fn(), equipmentLookup: vi.fn(), getCurrentShiftReport: vi.fn(), listShiftReports: vi.fn(), submitShiftReport: vi.fn(), updateShiftReportDraft: vi.fn() }));
vi.mock('../retase/retase-api', () => ({ cancelOperationalAssignment: vi.fn(), createOperationalAssignment: vi.fn(), listOperationalAssignments: async () => ({ ok: true, items: [] }), updateOperationalAssignment: vi.fn() }));

const vendorId = '11111111-1111-4111-8111-111111111111';
const amId = '22222222-2222-4222-8222-222222222222';
const aaId = '33333333-3333-4333-8333-333333333333';
const sourceId = '44444444-4444-4444-8444-444444444444';
const crusherId = '55555555-5555-4555-8555-555555555555';
const reportId = '77777777-7777-4777-8777-777777777777';
const text = '*PT. Vendor Test*\n18/08/2026\nShift: 1\nTOTAL AM 1 UNIT\nOPS: 1 unit\nTOTAL DT 1 UNIT\nOPS: 1 unit\nAM: 07 Hyundai\nAA: 04\nBlok: B9\nMaterial: pile\nLSCR: 5';
const lookups: MasterLookupResponse = { ok: true, materialCategories: ['PILE'], vendors: [{ id: vendorId, code: 'VT', label: 'PT. Vendor Test', active: true, materialKinds: ['LS'] }], sources: [{ id: sourceId, code: 'B9', label: 'B9', block: 'B9', materialKind: 'LS', materialCategory: 'PILE', active: true }], crushers: [{ id: crusherId, code: 'LSCR5', label: 'LSCR 5', materialKind: 'LS', plantId: null, active: true }], plants: [], piles: [], shifts: [{ code: 'SHIFT_1', label: 'Shift 1', startTime: '07:30', endTime: '15:30', crossesMidnight: false }] };
let serverReport: ShiftReport | null;
let client: QueryClient;
function toReport(body: ShiftReportDraftInput): ShiftReport {
  return { ...body, vendorId, id: reportId, version: 1, status: 'DRAFT', note: body.note ?? null, createdByName: 'QC Test', updatedAt: '2026-08-18T08:00:00Z', assignments: body.assignments.map(a => ({ ...a, id: 'assignment', pileId: null, validFrom: null, validTo: null, aa: a.aaIds.map(id => ({ id, unitNo: '04' })) })) } as unknown as ShiftReport;
}
beforeEach(() => {
  vi.clearAllMocks();serverReport = null;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  client.setQueryData(['auth', 'me'], { ok: true, user: { role: 'QC_ANALYST', displayName: 'QC Test', vendorId: null } });
  vi.mocked(useMaterialLookups).mockReturnValue({ data: lookups, isError: false, isFetching: false, refetch: vi.fn() } as unknown as ReturnType<typeof useMaterialLookups>);
  vi.mocked(api.getCurrentShiftReport).mockImplementation(async () => ({ ok: true, item: serverReport }));
  vi.mocked(api.listShiftReports).mockImplementation(async () => ({ ok: true, items: serverReport ? [serverReport] : [], total: serverReport ? 1 : 0 }));
  vi.mocked(api.equipmentLookup).mockImplementation(async (_, type) => ({ ok: true, items: [{ id: type === 'AM' ? amId : aaId, vendorId, type, unitNo: type === 'AM' ? '07' : '04', code: type === 'AM' ? 'AM07' : 'AA04', label: type === 'AM' ? 'AM07 Hyundai' : 'AA04', active: true }] }));
  vi.mocked(api.createShiftReport).mockImplementation(async body => { serverReport = toReport(body); return { ok: true, item: serverReport }; });
  vi.mocked(api.updateShiftReportDraft).mockImplementation(async (_, body) => { serverReport = toReport({ vendorId, operationDate: '2026-08-18', shiftCode: 'SHIFT_1', materialKind: 'LS', ...body }); return { ok: true, item: serverReport }; });
  vi.mocked(api.submitShiftReport).mockImplementation(async () => { serverReport = { ...serverReport!, status: 'SUBMITTED' }; return { ok: true, item: serverReport }; });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
afterEach(() => { cleanup(); client.clear(); vi.restoreAllMocks(); });
async function openImport() {
  const Page = Route.options.component as ComponentType;
  render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
  fireEvent.change(screen.getByLabelText('Operation Date'), { target: { value: '2026-08-18' } });
  fireEvent.change(screen.getByLabelText('Vendor', { exact: true }), { target: { value: vendorId } });
  await waitFor(() => expect(api.getCurrentShiftReport).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('tab', { name: 'Impor WhatsApp' }));
  fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
  await waitFor(() => expect((screen.getByLabelText('AM penugasan 1') as HTMLSelectElement).value).toBe(amId));
}
async function applyImport() {
  await openImport();
  fireEvent.click(screen.getByRole('checkbox'));
  const apply = screen.getByRole('button', { name: 'Terapkan ke editor laporan' }) as HTMLButtonElement;
  await waitFor(() => expect(apply.disabled).toBe(false));
  fireEvent.click(apply);
  expect(screen.getByRole('tab', { name: 'Editor laporan' }).getAttribute('aria-selected')).toBe('true');
}
describe('vendor report WhatsApp workflow', () => {
  it('saves reviewed IDs, preserves text and submits the latest analyst corrections, not the old draft', async () => {
    await applyImport();
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(api.createShiftReport).toHaveBeenCalledWith(expect.objectContaining({ vendorId, operationDate: '2026-08-18', note: expect.stringContaining(text), assignments: [expect.objectContaining({ amId, sourceId, crusherId, aaIds: [aaId] })] })));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Simpan & Submit' }) as HTMLButtonElement).disabled).toBe(false));
    const note = screen.getByLabelText('Report Note') as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: note.value + '\nKoreksi QC: sudah diverifikasi' } });
    await act(async () => { await client.invalidateQueries({ queryKey: ['vendor-shift-current'] }); });
    expect(note.value).toContain('Koreksi QC');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & Submit' }));
    await waitFor(() => expect(api.submitShiftReport).toHaveBeenCalledWith(reportId));
    expect(api.updateShiftReportDraft).toHaveBeenLastCalledWith(reportId, expect.objectContaining({ note: expect.stringContaining('Koreksi QC') }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Revision' })).toBeTruthy());
    expect(serverReport?.status).toBe('SUBMITTED');
  });
  it('keeps pasted text when changing tabs and does not overwrite a dirty editor without confirmation', async () => {
    await applyImport();
    fireEvent.change(screen.getByLabelText('Report Note'), { target: { value: 'Catatan yang harus dipertahankan' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Impor WhatsApp' }));
    expect((screen.getByLabelText('Teks laporan WhatsApp') as HTMLTextAreaElement).value).toBe(text);
    vi.mocked(window.confirm).mockReturnValue(false);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan ke editor laporan' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Editor laporan' }));
    expect((screen.getByLabelText('Report Note') as HTMLTextAreaElement).value).toBe('Catatan yang harus dipertahankan');
    expect(api.createShiftReport).not.toHaveBeenCalled();
  });

  it('persists and submits a cross-crusher assignment with a null destination', async () => {
    await openImport();
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan ke editor laporan' }));
    expect((screen.getByLabelText('Pile Destination (opsional)') as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & Submit' }));
    await waitFor(() => expect(api.submitShiftReport).toHaveBeenCalledWith(reportId));
    expect(api.createShiftReport).toHaveBeenCalledWith(expect.objectContaining({ assignments: [expect.objectContaining({ crusherId: null })] }));
  });
  it('refreshes equipment master and selects the newly created AA without leaving the import', async () => {
    await openImport();
    const newId = '99999999-9999-4999-8999-999999999999';
    const originalLookup = vi.mocked(api.equipmentLookup).getMockImplementation()!;
    vi.mocked(createMaster).mockImplementation(async () => {
      vi.mocked(api.equipmentLookup).mockImplementation(async (...args) => {
        const response = await originalLookup(...args);
        return args[1] === 'AA' ? { ok: true, items: [...response.items, { ...response.items[0]!, id: newId, unitNo: '11', label: '11' }] } : response;
      });
      return { ok: true, item: { id: newId } };
    });
    fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text.replace('AA: 04', 'AA: AA 11') } });
    fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah AA ke master' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan master & gunakan' }));
    await waitFor(() => expect((screen.getByLabelText('AA AA11 penugasan 1') as HTMLSelectElement).value).toBe(newId));
    expect(createMaster).toHaveBeenCalledWith('equipment', expect.objectContaining({ vendorId, type: 'AA', unitNo: '11', materialKinds: ['LS'] }));
    fireEvent.click(screen.getByRole('checkbox'));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Terapkan ke editor laporan' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan ke editor laporan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Draft' }));
    await waitFor(() => expect(api.createShiftReport).toHaveBeenCalledWith(expect.objectContaining({ assignments: [expect.objectContaining({ aaIds: [newId] })] })));
  });
  it('adds a vendor to master and switches report context while retaining the pasted text', async () => {
    await openImport();
    const newId = '99999999-9999-4999-8999-999999999999';
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    vi.mocked(createMaster).mockImplementation(async () => {
      vi.mocked(useMaterialLookups).mockReturnValue({ data: { ...lookups, vendors: [...lookups.vendors, { ...lookups.vendors[0]!, id: newId, code: 'PT_NEW_VENDOR', label: 'PT. New Vendor' }] }, isError: false, isFetching: false, refetch: vi.fn() } as unknown as ReturnType<typeof useMaterialLookups>);
      return { ok: true, item: { id: newId } };
    });
    const newText = text.replace('PT. Vendor Test', 'PT. New Vendor');
    fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: newText } });
    fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
    fireEvent.click(screen.getByLabelText('Vendor master untuk laporan').closest('.wa-reference')!.querySelector('summary')!);
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah Vendor ke master' }));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan master & gunakan' }));
    await waitFor(() => expect((screen.getByLabelText('Vendor', { exact: true }) as HTMLSelectElement).value).toBe(newId));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lookups', 'master'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['master'] });
    expect(createMaster).toHaveBeenCalledWith('vendors', expect.objectContaining({ name: 'PT. New Vendor', materialKinds: ['LS'] }));
    expect((screen.getByLabelText('Teks laporan WhatsApp') as HTMLTextAreaElement).value).toBe(newText);
    await waitFor(() => expect(api.equipmentLookup).toHaveBeenCalledWith(newId, 'AA', 'LS'));
    expect((screen.getByLabelText('AM penugasan 1') as HTMLSelectElement).value).toBe('');
  });

  it('does not expose the import tab to vendor users', () => {
    client.setQueryData(['auth', 'me'], { ok: true, user: { role: 'VENDOR', displayName: 'Vendor', vendorId } });
    const Page = Route.options.component as ComponentType;
    render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
    expect(screen.queryByRole('tab', { name: 'Impor WhatsApp' })).toBeNull();
  });
});
