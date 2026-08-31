import { useLayerEditor } from './use-layer-editor';
import { LayerDimensionsDialog } from './layer-dimensions-dialog';
import { Component, lazy, Suspense, useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { positionLabel, WarehouseMap } from './warehouse-map';
import { chronologicalLayers, createLayerColorScale, formatValue, NO_DATA_COLOR, periodLabel, pileColor, TIME_COLORS, timeColor, timeDomain } from './stockpile-visual-model';
import type { CameraPreset, ColorMode, WarehouseMapProps } from './stockpile-visual-model';
import './stockpile-3d.css';
import './layer-editor.css';

const WarehouseScene3D = lazy(() => import('./warehouse-scene-3d'));

class SceneBoundary extends Component<{ children: ReactNode; onUnavailable: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onUnavailable(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export function StockpileLegend({ data, colorMode }: Pick<WarehouseMapProps, 'data' | 'colorMode'>) {
  const domain = timeDomain(data.layers);
  const ramp = !domain.start ? NO_DATA_COLOR : domain.start === domain.end ? timeColor(.5) : `linear-gradient(90deg, ${TIME_COLORS.join(',')})`;
  const clay = data.layout.materialKind === 'CL';
  const ranges = clay ? ['SM < 2,3', 'SM 2,3–2,8', 'SM > 2,8'] : ['LSF < 1200', 'LSF 1200–1300', 'LSF > 1300'];
  const items = colorMode === 'PILE' ? data.lots.map(lot => ({ color: pileColor(lot.id), label: `Lot ${lot.lotNo} · ${lot.logicalPileName}` }))
    : colorMode === 'PRIMARY' ? ['#c77dcf', '#54c6df', '#f0a35c'].map((color, index) => ({ color, label: ranges[index]! }))
    : [{ color: '#7bcf65', label: 'Dalam target' }, { color: '#f4c95d', label: 'Perlu cek' }];
  return <div className="pile-legend" aria-label="Legenda warna layer">
    {colorMode === 'TIME' ? <div className="pile-time-legend"><strong>Urutan tanggal Mix</strong>
      <div className="pile-gradient" style={{ background: ramp }} />
      <div><span>{domain.start ?? '—'} · lebih lama</span><span>{domain.end ?? '—'} · lebih baru</span></div>
      <small>Warna menurut tanggal Mix pertama; rentang lengkap ada di detail. Bukan waktu isi aktual.</small>
    </div> : <div className="pile-legend-items">{items.map(item => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}</div>}
    <span className="pile-no-data"><i style={{ background: NO_DATA_COLOR }} />{colorMode === 'TIME' ? 'Tanggal tidak tersedia' : 'No data'}</span>
  </div>;
}

export function StockpileViewport(props: WarehouseMapProps) {
  const editor = useLayerEditor(props);
  const selected = props.data.layers.find(layer => layer.id === props.selectedLayerId);
  const previewData = editor.draft ? { ...props.data, layers: props.data.layers.map(layer => layer.id === editor.draft!.id ? editor.draft! : layer) } : props.data;
  const [view, setView] = useState<'2D' | '3D'>('3D');
  const [unavailable, setUnavailable] = useState(false);
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('PERSPECTIVE');
  const [resetKey, setResetKey] = useState(0);
  const [separation, setSeparation] = useState(0);
  const [isolate, setIsolate] = useState(false);
  const onUnavailable = useCallback(() => { setUnavailable(true); setView('2D'); }, []);
  const ordered = useMemo(() => chronologicalLayers(props.data.layers), [props.data.layers]);
  const colorFor = useMemo(() => createLayerColorScale(props.colorMode, props.data), [props.colorMode, props.data]);
  const modes: Array<{ value: CameraPreset; label: string }> = [
    { value: 'PERSPECTIVE', label: 'Perspektif' }, { value: 'SIDE', label: 'Samping' }, { value: 'TOP', label: 'Atas' },
  ];
  const sceneKey = `${props.data.layout.id}-${props.data.asOf}`;
  return <div className="pile-viewport">
    <div className="pile-view-toolbar">
      <div className="pile-segment" aria-label="Mode peta">{(['3D', '2D'] as const).map(mode => <button key={mode} type="button"
        aria-pressed={view === mode} onClick={() => { setView(mode); if (mode === '3D') setUnavailable(false); }}>{mode === '3D' ? '◈ 3D Pile' : '▤ 2D Layer'}</button>)}</div>
      {view === '3D' && <>
        <div className="pile-camera-options" aria-label="Sudut kamera">{modes.map(mode => <button key={mode.value} type="button" aria-pressed={cameraPreset === mode.value} onClick={() => setCameraPreset(mode.value)}>{mode.label}</button>)}</div>
        <button className="btn small" type="button" onClick={() => { setCameraPreset('PERSPECTIVE'); setResetKey(key => key + 1); setSeparation(0); setIsolate(false); }}>Reset tampilan</button>
      </>}
    </div>
    <div className="pile-editor-toolbar">
      <button className="btn small" type="button" aria-pressed={editor.editMode} disabled={!editor.canEdit || view !== '3D'}
        onClick={() => { editor.setEditMode(!editor.editMode); setSeparation(0); }}>✥ {editor.editMode ? 'Selesai atur layer' : 'Atur layer'}</button>
      <button className="btn small" type="button" disabled={!editor.canEdit || selected?.lotStatus !== 'ACTIVE'} onClick={() => selected && editor.openDimensions(selected)}>Edit dimensi</button>
      <span>{editor.busy ? 'Menyimpan & memuat data terbaru…' : editor.editMode ? 'Drag badan layer / handle. Samping: geser posisi & level; Atas: posisi & lebar.' : 'Double-click layer untuk edit panjang, lebar, tinggi.'}</span>
      {!editor.available && <small>{props.readOnly || props.data.isHistorical ? 'Historis · hanya baca' : 'Editor dimensi memerlukan API terbaru & migrasi 0022.'}</small>}
    </div>
    {(editor.error || editor.message) && <div className={`pile-editor-status ${editor.error ? 'is-error' : ''}`} role={editor.error ? 'alert' : 'status'}>
      {editor.error || editor.message}
      {editor.blocked && <><span>Periksa data terbaru sebelum mengedit lagi.</span><button className="btn small" type="button" disabled={editor.busy} onClick={() => void editor.reload()}>Muat ulang editor</button></>}
    </div>}
    {unavailable && <div className="pile-fallback" role="status">3D tidak tersedia pada perangkat ini atau gagal dimuat. Peta 2D tetap dapat digunakan.</div>}
    {view === '3D' ? <SceneBoundary key={sceneKey} onUnavailable={onUnavailable}>
      <Suspense fallback={<div className="pile-scene-loading" role="status"><span />Menyiapkan peta pile 3D…</div>}>
        <WarehouseScene3D key={sceneKey} {...props} data={previewData}
          editor={{ enabled: editor.editMode && editor.canEdit && separation === 0 && !editor.dialog, onPreview: editor.setDraft, onCommit: editor.commit, onDimensions: editor.openDimensions }} cameraPreset={cameraPreset} resetKey={resetKey} separation={separation} isolate={isolate} onUnavailable={onUnavailable} />
      </Suspense>
    </SceneBoundary> : <WarehouseMap {...props} />}
    {view === '3D' && <div className="pile-inspection-controls">
      <label><span>Pisahkan layer</span><input aria-label="Pisahkan layer" type="range" min="0" max="1" step="0.05" value={separation} disabled={editor.editMode || editor.busy} onChange={event => setSeparation(Number(event.target.value))} /><output>{Math.round(separation * 100)}%</output></label>
      <label className="pile-isolate"><input type="checkbox" checked={isolate} disabled={!props.selectedLayerId} onChange={event => setIsolate(event.target.checked)} />Fokus layer terpilih</label>
      <span>{separation ? 'Jarak layer hanya efek inspeksi, bukan level asli.' : 'Lebar dasar tersimpan sebagai % gudang; kemiringan tetap ilustratif.'}</span>
    </div>}
    <div className="pile-rec-control">
      <label htmlFor="pile-rec-position"><strong>RECLAIMER</strong><span>{positionLabel(props.recPosition, props.data.layout.postMarks)}</span></label>
      <input id="pile-rec-position" aria-label="Geser posisi REC" type="range" min="0" max={props.data.layout.axisLength} step="0.1" value={props.recPosition}
        disabled={props.readOnly} onChange={event => props.onRecPositionChange(Number(event.target.value))} />
      <small>{props.readOnly ? 'Historis · hanya baca' : 'Geser, lalu Simpan REC'}</small>
    </div>
    <StockpileLegend data={props.data} colorMode={props.colorMode} />
    {!!ordered.length && <details className="pile-layer-browser" open>
      <summary>Inspeksi layer <span>{ordered.length} layer · tanggal Mix lama → baru</span></summary>
      <div className="pile-layer-list">{ordered.map((layer, index) => <button key={layer.id} type="button" aria-pressed={props.selectedLayerId === layer.id}
        onClick={() => props.onSelectLayer(layer)} onDoubleClick={() => editor.openDimensions(layer)} className="pile-layer-chip">
        <i style={{ background: colorFor(layer) }} /><span><strong>{String(index + 1).padStart(2, '0')} · Lot {layer.lotNo}</strong>
          <small>{periodLabel(layer)}</small><small>{positionLabel(layer.startPosition, props.data.layout.postMarks)} → {positionLabel(layer.endPosition, props.data.layout.postMarks)}</small></span>
        <b>{formatValue(layer.totalTon, 0)} t</b>
      </button>)}</div>
    </details>}
    {editor.dialog && <LayerDimensionsDialog key={editor.dialog.id + ':' + editor.dialog.version} layer={editor.dialog} layout={props.data.layout}
      busy={editor.busy} error={editor.error} onClose={() => editor.setDialog(null)} onSave={editor.commit} />}
  </div>;
}

export const COLOR_MODES: Array<{ value: ColorMode; label: string }> = [
  { value: 'TIME', label: 'Waktu isi*' }, { value: 'STATUS', label: 'Status mutu' }, { value: 'PRIMARY', label: 'Mutu' }, { value: 'PILE', label: 'Pile' },
];
