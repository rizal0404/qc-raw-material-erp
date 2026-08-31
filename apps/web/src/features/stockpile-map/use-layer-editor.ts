import { useEffect, useRef, useState } from 'react';
import type { StockpileLayer } from './stockpile-map-api';
import type { WarehouseMapProps } from './stockpile-visual-model';
import { geometryError, geometryOf, sameGeometry } from './layer-geometry';
import type { LayerGeometry } from './layer-geometry';

export type SceneLayerEditor = {
  enabled: boolean;
  onPreview: (layer: StockpileLayer | null) => void;
  onCommit: (layer: StockpileLayer, geometry: LayerGeometry) => Promise<boolean>;
  onDimensions: (layer: StockpileLayer) => void;
};

export function useLayerEditor(props: WarehouseMapProps) {
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState<StockpileLayer | null>(null);
  const [dialog, setDialog] = useState<StockpileLayer | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const alive = useRef(true);
  const current = useRef(props); current.current = props;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const available = !props.readOnly && !props.data.isHistorical && props.data.geometryEditing === true && !!props.onSaveGeometry;
  const canEdit = available && !props.geometryLocked && !busy && !blocked;
  async function commit(layer: StockpileLayer, geometry: LayerGeometry) {
    const p = current.current;
    if (!alive.current || pending.current || !canEdit || layer.lotStatus !== 'ACTIVE') return false;
    const latest = p.data.layers.find(item => item.id === layer.id);
    if (!latest || latest.version !== layer.version) { setDraft(null); setError('Layer berubah saat diedit. Buka kembali editor dari data terbaru.'); return false; }
    const invalid = geometryError(geometry, p.data.layout);
    if (invalid) { setDraft(null); setError(invalid); return false; }
    if (sameGeometry(geometryOf(layer, p.data.layout), geometry)) { setDraft(null); return true; }
    pending.current = true; setBusy(true); setError(''); setMessage('');
    setDraft({ ...layer, ...geometry });
    try {
      await p.onSaveGeometry!(layer, geometry);
      if (alive.current) setMessage('Dimensi dan posisi layer tersimpan.');
      return true;
    } catch (cause) {
      // A lost response may mean the write succeeded. Never retry an old version blindly.
      if (alive.current) { setError(cause instanceof Error ? cause.message : 'Gagal menyimpan layer.'); setBlocked(true); setDialog(null); }
      return false;
    } finally {
      pending.current = false;
      if (alive.current) { setDraft(null); setBusy(false); }
    }
  }
  async function reload() {
    if (pending.current || !props.onReloadGeometry) return;
    pending.current = true; setBusy(true);
    try { await props.onReloadGeometry(); if (alive.current) { setBlocked(false); setError(''); setDialog(null); setMessage('Data terbaru dimuat. Silakan ulangi perubahan.'); } }
    catch { if (alive.current) setError('Belum dapat memuat data terbaru. Periksa koneksi dan coba lagi.'); }
    finally { pending.current = false; if (alive.current) setBusy(false); }
  }
  function openDimensions(layer: StockpileLayer) {
    if (!canEdit || layer.lotStatus !== 'ACTIVE') return;
    props.onSelectLayer(layer); setError(''); setMessage(''); setDialog(layer);
  }
  return { editMode, setEditMode, draft, setDraft, dialog, setDialog, busy, blocked, error, message, available, canEdit, commit, reload, openDimensions };
}
