// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StockpileLegend, StockpileViewport } from './stockpile-viewport';
import { SelectedLayerDetails, WarehouseMap } from './warehouse-map';
import { testMap } from './stockpile-test-fixture';
import type { WarehouseMapProps } from './stockpile-visual-model';

vi.mock('./warehouse-scene-3d', () => ({ default: (props: WarehouseMapProps & { onUnavailable: () => void; cameraPreset: string; separation: number }) =>
  <div data-testid="scene"><span>{props.cameraPreset} / {props.separation}</span>
    <button onClick={() => props.onSelectLayer(props.data.layers[0]!)}>Select mesh</button>
    <button onClick={props.onUnavailable}>Lose WebGL</button>
  </div>,
}));
afterEach(cleanup);

function Harness({ readOnly = false }: { readOnly?: boolean }) {
  const [selectedLayerId, onSelected] = useState<string | null>(null);
  const [recPosition, onRecPositionChange] = useState(0);
  return <StockpileViewport data={testMap()} colorMode="TIME" selectedLayerId={selectedLayerId}
    onSelectLayer={layer => onSelected(layer.id)} recPosition={recPosition} onRecPositionChange={onRecPositionChange} readOnly={readOnly} />;
}

describe('stockpile viewport', () => {
  it('loads 3D, selects a mesh and preserves selection across view switches', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByText('Select mesh'));
    const chip = screen.getByRole('button', { name: /01 · Lot 12/ });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /2D Layer/ }));
    expect(screen.getByRole('img', { name: 'Peta mutu Gudang Uji' })).toBeTruthy();
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /3D Pile/ }));
    await screen.findByTestId('scene');
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });
  it('supports camera presets, layer separation and reset', async () => {
    render(<Harness />); await screen.findByTestId('scene');
    fireEvent.click(screen.getByRole('button', { name: 'Atas' }));
    fireEvent.change(screen.getByLabelText('Pisahkan layer'), { target: { value: '.6' } });
    expect(screen.getByText('TOP / 0.6')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reset tampilan' }));
    expect(screen.getByText('PERSPECTIVE / 0')).toBeTruthy();
  });
  it('falls back to the functioning SVG when the GPU context is lost', async () => {
    render(<Harness />);
    fireEvent.click(await screen.findByText('Lose WebGL'));
    expect(screen.getByRole('status').textContent).toContain('Peta 2D tetap');
    expect(screen.getByRole('img', { name: 'Peta mutu Gudang Uji' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2D Layer/ }).getAttribute('aria-pressed')).toBe('true');
  });
  it('shares REC position between 3D and 2D, with no mutation for inspecting layers', async () => {
    render(<Harness />); await screen.findByTestId('scene');
    fireEvent.change(screen.getByLabelText('Geser posisi REC'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /2D Layer/ }));
    expect(screen.getByRole('slider', { name: 'Posisi REC Tiang 5' }).getAttribute('aria-valuenow')).toBe('5');
  });
  it('disables both REC inputs in history but still permits layer inspection', async () => {
    render(<Harness readOnly />); await screen.findByTestId('scene');
    expect((screen.getByLabelText('Geser posisi REC') as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /2D Layer/ }));
    expect(screen.getByRole('slider', { name: 'Posisi REC Tiang 10' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: /01 · Lot 12/ }));
    expect(screen.getByRole('button', { name: /01 · Lot 12/ }).getAttribute('aria-pressed')).toBe('true');
  });
  it('renders the legend for the active colour mode, not a stale status legend', () => {
    const { rerender } = render(<StockpileLegend data={testMap()} colorMode="TIME" />);
    expect(screen.getByText('Urutan tanggal Mix')).toBeTruthy();
    expect(screen.queryByText('Dalam target')).toBeNull();
    rerender(<StockpileLegend data={testMap()} colorMode="PRIMARY" />);
    expect(screen.getByText('LSF < 1200')).toBeTruthy();
  });
  it('keeps 2D keyboard selection and REC adjustment working', () => {
    const select = vi.fn(), move = vi.fn();
    render(<WarehouseMap data={testMap()} colorMode="TIME" selectedLayerId={null} onSelectLayer={select} recPosition={5} onRecPositionChange={move} />);
    fireEvent.keyDown(screen.getByRole('button', { name: /Lot 12/ }), { key: 'Enter' });
    expect(select).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(move).toHaveBeenCalledWith(5.1);
  });
  it('shows an empty dataset without fabricated layers or selectable placeholders', async () => {
    render(<StockpileViewport data={testMap([])} colorMode="TIME" selectedLayerId={null} onSelectLayer={vi.fn()} recPosition={0} onRecPositionChange={vi.fn()} />);
    await screen.findByTestId('scene');
    expect(screen.queryByText('Inspeksi layer')).toBeNull();
    expect(screen.getByText('Tanggal tidak tersedia')).toBeTruthy();
  });
  it('uses a single colour legend when all layers have the same date', () => {
    const { container } = render(<StockpileLegend data={testMap()} colorMode="TIME" />);
    expect(container.querySelector('.pile-gradient')?.getAttribute('style')).not.toContain('linear-gradient');
  });
  it('keeps history details read-only and exposes time and post ranges', async () => {
    const data = testMap();
    render(<SelectedLayerDetails layer={data.layers[0]!} lot={data.lots[0]!} marks={data.layout.postMarks} onEdit={vi.fn()} onEditLot={vi.fn()} onToggleLot={vi.fn()} readOnly />);
    expect(screen.queryByRole('button', { name: 'Edit layer' })).toBeNull();
    expect(screen.getByText('Tiang 10 → Tiang 5')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/bukan timestamp isi aktual/)).toBeTruthy());
  });
});
