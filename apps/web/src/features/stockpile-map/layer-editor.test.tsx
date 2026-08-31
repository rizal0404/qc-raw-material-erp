// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { StockpileViewport } from './stockpile-viewport';
import { testMap } from './stockpile-test-fixture';
import type { WarehouseMapProps } from './stockpile-visual-model';
import type { SceneLayerEditor } from './use-layer-editor';
import { geometryOf } from './layer-geometry';

vi.mock('./warehouse-scene-3d', () => ({ default: (props: WarehouseMapProps & { editor: SceneLayerEditor }) => <button onClick={() => {
  const layer = props.data.layers[0]!;
  void props.editor.onCommit(layer, { ...geometryOf(layer, props.data.layout), endPosition: 4 });
}}>Simulate drop</button> }));
afterEach(cleanup);

function Harness({ save = async () => {}, readOnly = false, supported = true, reclaimed = false }: {
  save?: NonNullable<WarehouseMapProps['onSaveGeometry']>; readOnly?: boolean; supported?: boolean; reclaimed?: boolean;
}) {
  const [data, setData] = useState(() => { const map = testMap(); return { ...map, geometryEditing: supported, layers: map.layers.map(layer => ({ ...layer, lotStatus: reclaimed ? 'RECLAIMED' as const : 'ACTIVE' as const })) }; });
  return <StockpileViewport data={data} selectedLayerId={data.layers[0]!.id} onSelectLayer={() => {}} colorMode="TIME" recPosition={0} onRecPositionChange={() => {}} readOnly={readOnly}
    onReloadGeometry={async () => {}} onSaveGeometry={async (layer, geometry) => { await save(layer, geometry); setData(current => ({ ...current, layers: current.layers.map(item => item.id === layer.id ? { ...item, ...geometry, version: item.version + 1 } : item) })); }} />;
}

describe('layer autosave', () => {
  it('double-click opens dimensions and saves all axes with the selected version', async () => {
    const save = vi.fn(async () => {}); render(<Harness save={save} />);
    fireEvent.doubleClick(screen.getByRole('button', { name: /01 · Lot 12/ }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Panjang (sumbu tiang)'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Lebar dasar (% gudang)'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Tinggi (level)'), { target: { value: '.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Terapkan & simpan' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(save).toHaveBeenCalledTimes(1);
    const [layer, geometry] = save.mock.calls[0]! as unknown as Parameters<NonNullable<WarehouseMapProps['onSaveGeometry']>>;
    expect(layer.version).toBe(1); expect(geometry.endPosition - geometry.startPosition).toBe(2.5);
    expect(geometry.endDepth - geometry.startDepth).toBe(40); expect(geometry.topLevel - geometry.bottomLevel).toBeCloseTo(.4);
    fireEvent.click(screen.getByRole('button', { name: 'Edit dimensi' }));
    expect((screen.getByLabelText('Lebar dasar (% gudang)') as HTMLInputElement).value).toBe('40');
  });
  it('does not save on cancel or invalid dimensions', () => {
    const save = vi.fn(async () => {}); render(<Harness save={save} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit dimensi' }));
    fireEvent.change(screen.getByLabelText('Lebar dasar (% gudang)'), { target: { value: '' } });
    expect((screen.getByRole('button', { name: 'Terapkan & simpan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(screen.getByLabelText('Lebar dasar (% gudang)'), { key: 'Escape' });
    expect(save).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it.each([{ readOnly: true }, { supported: false }, { reclaimed: true }])('guards read-only, old servers and reclaimed layers: %j', props => {
    render(<Harness {...props} />);
    expect((screen.getByRole('button', { name: 'Edit dimensi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.doubleClick(screen.getByRole('button', { name: /01 · Lot 12/ }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('serializes drops and rolls back on failure until explicit refresh', async () => {
    let reject!: (error: Error) => void;
    const save = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    render(<Harness save={save} />);
    fireEvent.click(await screen.findByText('Simulate drop')); fireEvent.click(screen.getByText('Simulate drop'));
    expect(save).toHaveBeenCalledTimes(1);
    reject(new Error('Konflik versi'));
    await screen.findByRole('alert');
    expect((screen.getByRole('button', { name: 'Edit dimensi' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Muat ulang editor' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Edit dimensi' }) as HTMLButtonElement).disabled).toBe(false));
  });
});
