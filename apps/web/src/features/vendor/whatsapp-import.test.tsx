// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MasterLookupResponse } from '@qc/contracts';
import { WhatsAppImport } from './whatsapp-import';

afterEach(cleanup);
const text = 'PT. Vendor Test\n18/08/2026\nShift: 1\nTOTAL AM 1 UNIT\nOPS: 1 unit\nTOTAL DT 1 UNIT\nOPS: 1 unit\nAM: 07 Hyundai\nAA: 04\nBlok: B9\nMaterial: pile\nLSCR: 4/5';
const lookups: MasterLookupResponse = { ok: true, materialCategories: ['PILE'], vendors: [{ id: 'vendor', code: 'VT', label: 'PT. Vendor Test', active: true, materialKinds: ['LS'] }], sources: [{ id: 'source', code: 'B9', label: 'B9', block: 'B9', materialKind: 'LS', materialCategory: 'PILE', active: true }], crushers: [4, 5].map(n => ({ id: `crusher-${n}`, code: `LSCR${n}`, label: `LSCR ${n}`, active: true, materialKind: 'LS', plantId: null })), plants: [], piles: [], shifts: [] };
function setup() {
  const props = { vendorId: 'vendor', operationDate: '2026-08-18', shiftCode: 'SHIFT_1' as const, materialKind: 'LS' as const, lookups, amItems: [{ id: 'am', code: 'AM07', unitNo: 'AM07', label: 'AM07 Hyundai', active: true, vendorId: 'vendor', type: 'AM' as const }], aaItems: [{ id: 'aa', code: 'AA04', unitNo: 'AA04', label: 'AA04', active: true, vendorId: 'vendor', type: 'AA' as const }], disabled: false, onDirty: vi.fn(), onContext: vi.fn(), onApply: vi.fn(() => true) };
  const view = render(<WhatsAppImport {...props} />);
  fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
  return { ...view, props };
}
const applyButton = () => screen.getByRole('button', { name: 'Terapkan ke editor laporan' }) as HTMLButtonElement;
describe('WhatsApp import review', () => {
  it('supports selecting a specific crusher and requires explicit review before applying canonical IDs', () => {
    const { props } = setup();
    expect(applyButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: 'crusher-5' } });
    expect(applyButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(applyButton());
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ note: expect.stringContaining(text), assignments: [expect.objectContaining({ amId: 'am', sourceId: 'source', crusherId: 'crusher-5', aaIds: ['aa'] })] }));
    expect(props.onDirty).toHaveBeenLastCalledWith(false);
  });
  it('invalidates the preview when the text changes and keeps missing AA unresolved', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: 'crusher-5' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text.replace('AA: 04', 'AA: 999') } });
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toContain('Teks berubah');
    fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
    expect((screen.getByLabelText('AA 999 penugasan 1') as HTMLSelectElement).value).toBe('');
  });
  it('requires the report date context and clears manual mappings when vendor changes', () => {
    const { rerender, props } = setup();
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: 'crusher-5' } });
    rerender(<WhatsAppImport {...props} operationDate="2026-08-19" />);
    fireEvent.click(screen.getByRole('button', { name: 'Gunakan konteks hasil parsing' }));
    expect(props.onContext).toHaveBeenCalledWith({ vendorId: 'vendor', operationDate: '2026-08-18', shiftCode: 'SHIFT_1' });
    expect(applyButton().disabled).toBe(true);
    rerender(<WhatsAppImport {...props} vendorId="different-vendor" />);
    expect((screen.getByLabelText('AM penugasan 1') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Crusher penugasan 1') as HTMLSelectElement).value).toBe('');
  });
  it('blocks applying while current report or masters are unavailable', () => {
    const { rerender, props } = setup();
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: 'crusher-5' } });
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<WhatsAppImport {...props} disabled />);
    fireEvent.click(applyButton());
    expect(props.onApply).not.toHaveBeenCalled();
  });
  it('rejects a previously selected master if it becomes inactive on refresh', () => {
    const { rerender, props } = setup();
    fireEvent.change(screen.getByLabelText('Crusher penugasan 1'), { target: { value: 'crusher-5' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(applyButton().disabled).toBe(false);
    rerender(<WhatsAppImport {...props} aaItems={props.aaItems.map(item => ({ ...item, active: false }))} />);
    expect(applyButton().disabled).toBe(true);
  });

  it('allows a shared destination to remain blank after explicit review', () => {
    const { props } = setup();
    expect((screen.getByLabelText('Crusher penugasan 1') as HTMLSelectElement).value).toBe('');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(applyButton());
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ assignments: [expect.objectContaining({ crusherId: '' })] }));
  });
  it('offers a similar vendor for deliberate selection and refreshes search after reparsing', () => {
    const { props } = setup();
    fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text.replace('Vendor Test', 'Vendor Tesst') } });
    fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
    expect((screen.getByLabelText('Cari Vendor master untuk laporan') as HTMLInputElement).value).toBe('PT. Vendor Tesst');
    fireEvent.click(screen.getByRole('button', { name: /Gunakan PT. Vendor Test/ }));
    expect(props.onContext).toHaveBeenCalledWith({ vendorId: 'vendor', operationDate: '2026-08-18', shiftCode: 'SHIFT_1' });
  });
  it('creates missing AA only on confirmation, handles API errors, and selects its refreshed master ID', async () => {
    const { props, rerender } = setup();
    const onCreateEquipment = vi.fn().mockRejectedValueOnce(new Error('Nomor sudah terdaftar')).mockResolvedValueOnce('new-aa');
    rerender(<WhatsAppImport {...props} onCreateEquipment={onCreateEquipment} />);
    fireEvent.change(screen.getByLabelText('Teks laporan WhatsApp'), { target: { value: text.replace('AA: 04', 'AA: AA 11') } });
    fireEvent.click(screen.getByRole('button', { name: 'Parsing laporan' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Tambah AA ke master' }));
    expect(onCreateEquipment).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Nomor AA baru') as HTMLInputElement).value).toBe('11');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan master & gunakan' }));
    await screen.findByText('Nomor sudah terdaftar');
    expect(applyButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Simpan master & gunakan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onCreateEquipment).toHaveBeenLastCalledWith({ vendorId: 'vendor', type: 'AA', unitNo: '11', brand: null, aliases: ['AA11'], materialKinds: ['LS'] });
    rerender(<WhatsAppImport {...props} onCreateEquipment={onCreateEquipment} aaItems={[...props.aaItems, { ...props.aaItems[0]!, id: 'new-aa', unitNo: '11', label: '11' }]} />);
    expect((screen.getByLabelText('AA AA11 penugasan 1') as HTMLSelectElement).value).toBe('new-aa');
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(applyButton());
    expect(props.onApply).toHaveBeenCalledWith(expect.objectContaining({ assignments: [expect.objectContaining({ aaIds: ['new-aa'] })] }));
  });

});
