import { useEffect, useRef, useState } from 'react';
import type { StockpileLayer, WarehouseLayout } from './stockpile-map-api';
import { Modal } from '../../components/modal';
import { geometryError, geometryOf, roundGeometry } from './layer-geometry';
import type { LayerGeometry } from './layer-geometry';

export function LayerDimensionsDialog({ layer, layout, busy, error, onClose, onSave }: {
  layer: StockpileLayer; layout: WarehouseLayout; busy: boolean; error: string;
  onClose: () => void; onSave: (layer: StockpileLayer, geometry: LayerGeometry) => Promise<boolean>;
}) {
  const base = geometryOf(layer, layout);
  const [fields, setFields] = useState({ length: String(roundGeometry(base.endPosition - base.startPosition)), width: String(roundGeometry(base.endDepth - base.startDepth)),
    height: String(roundGeometry(base.topLevel - base.bottomLevel)), x: String(base.startPosition), y: String(base.bottomLevel), z: String(base.startDepth) });
  const root = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector('input')?.focus();
    return () => previous?.focus();
  }, []);
  const value = (key: keyof typeof fields) => fields[key].trim() === '' ? NaN : Number(fields[key]);
  const geometry: LayerGeometry = { startPosition: value('x'), endPosition: roundGeometry(value('x') + value('length')),
    bottomLevel: value('y'), topLevel: roundGeometry(value('y') + value('height')), startDepth: value('z'), endDepth: roundGeometry(value('z') + value('width')) };
  const validation = geometryError(geometry, layout);
  const labels = { length: 'Panjang (sumbu tiang)', width: 'Lebar dasar (% gudang)', height: 'Tinggi (level)', x: 'Posisi awal (sumbu tiang)', z: 'Posisi melintang awal (%)', y: 'Level bawah' };
  return <Modal title="Dimensi & posisi layer" subtitle={layer.label || `Lot ${layer.lotNo} · versi ${layer.version}`} onClose={() => { if (!busy) onClose(); }}>
    <form ref={root} onSubmit={async event => { event.preventDefault(); if (!validation && !busy && await onSave(layer, geometry)) onClose(); }}
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
        if (event.key === 'Tab') {
          const inputs = Array.from(root.current?.querySelectorAll<HTMLElement>('input:not(:disabled),button:not(:disabled)') ?? []);
          if (event.shiftKey && document.activeElement === inputs[0]) { event.preventDefault(); inputs.at(-1)?.focus(); }
          if (!event.shiftKey && document.activeElement === inputs.at(-1)) { event.preventDefault(); inputs[0]?.focus(); }
        }
      }}>
      <div className="pile-dimension-grid">{(Object.keys(labels) as Array<keyof typeof labels>).map(key => <label key={key}><span>{labels[key]}</span>
        <input type="number" required step="any" min={['length', 'width', 'height'].includes(key) ? .0001 : 0} value={fields[key]} disabled={busy}
          onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} /></label>)}</div>
      <p className="pile-dimension-note">Ukuran memakai sumbu/level gudang dan persentase lebar, bukan meter. Perubahan geometri tidak mengubah tonase atau data Mix.</p>
      {(validation || error) && <div className="alert error" role="alert">{validation || error}</div>}
      <div className="pile-dimension-actions"><button className="btn" type="button" disabled={busy} onClick={onClose}>Batal</button>
        <button className="btn primary" type="submit" disabled={busy || !!validation}>{busy ? 'Menyimpan…' : 'Terapkan & simpan'}</button></div>
    </form>
  </Modal>;
}
