import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Vector3 } from 'three';
import type { StockpileLayer, WarehouseLayout } from './stockpile-map-api';
import type { CameraPreset } from './stockpile-visual-model';
import { SCENE, sceneX, sceneY } from './stockpile-visual-model';
import { geometryOf, gestureGeometry } from './layer-geometry';
import type { GeometryGesture } from './layer-geometry';
import type { SceneLayerEditor } from './use-layer-editor';

export type DragStart = (event: { clientX: number; clientY: number; pointerId: number; button: number; preventDefault: () => void }, layer: StockpileLayer, mode: GeometryGesture) => void;

/** Project the warehouse axes using the ACTUAL camera, including orbit/zoom.
 * Global pointer tracking keeps dragging reliable outside the mesh/canvas. */
export function useLayerDrag(layout: WarehouseLayout, preset: CameraPreset, editor: SceneLayerEditor | undefined): DragStart {
  const { camera, gl } = useThree();
  const cancel = useRef<(() => void) | null>(null);
  const latest = useRef(editor); latest.current = editor;
  useEffect(() => () => cancel.current?.(), []);
  useEffect(() => { if (!editor?.enabled) cancel.current?.(); }, [editor?.enabled]);
  return (event, layer, mode) => {
    if (!editor?.enabled || layer.lotStatus !== 'ACTIVE' || event.button !== 0) return;
    event.preventDefault(); cancel.current?.();
    const base = geometryOf(layer, layout);
    const rect = gl.domElement.getBoundingClientRect();
    const origin = new Vector3(sceneX((base.startPosition + base.endPosition) / 2, layout), sceneY(base.bottomLevel, layout), 0);
    const screen = (v: Vector3) => { const p = v.project(camera); return { x: p.x * rect.width / 2, y: -p.y * rect.height / 2 }; };
    const o = screen(origin.clone());
    const axis = (v: Vector3) => { const p = screen(origin.clone().add(v)); return { x: p.x - o.x, y: p.y - o.y }; };
    const axes = { x: axis(new Vector3(SCENE.length / layout.axisLength, 0, 0)), y: axis(new Vector3(0, SCENE.height / layout.maxLevel, 0)), z: axis(new Vector3(0, 0, SCENE.depth / 100)) };
    let next = base, moved = false;
    const move = (pointer: PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return;
      const dx = pointer.clientX - event.clientX, dy = pointer.clientY - event.clientY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      pointer.preventDefault(); moved = true;
      const delta = { x: 0, y: 0, z: 0 };
      if (mode === 'MOVE') {
        const secondary = preset === 'SIDE' ? 'y' : 'z';
        const a = axes.x, b = axes[secondary], determinant = a.x * b.y - a.y * b.x;
        if (Math.abs(determinant) < .05) return; // Edge-on plane: choose another camera.
        delta.x = (dx * b.y - dy * b.x) / determinant;
        delta[secondary] = (dy * a.x - dx * a.y) / determinant;
      } else {
        const key = mode === 'LENGTH' ? 'x' : mode === 'WIDTH' ? 'z' : 'y';
        const a = axes[key], squared = a.x * a.x + a.y * a.y;
        if (squared < .05) return;
        delta[key] = (dx * a.x + dy * a.y) / squared;
      }
      next = gestureGeometry(base, mode, delta, layout);
      latest.current?.onPreview({ ...layer, ...next });
    };
    const cleanup = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', abort);
      window.removeEventListener('keydown', key); window.removeEventListener('blur', abort); cancel.current = null;
    };
    const abort = () => { cleanup(); latest.current?.onPreview(null); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); abort(); } };
    const up = (pointer: PointerEvent) => {
      if (pointer.pointerId !== event.pointerId) return;
      cleanup();
      if (moved) void latest.current?.onCommit(layer, next); else latest.current?.onPreview(null);
    };
    cancel.current = abort;
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', abort);
    window.addEventListener('keydown', key); window.addEventListener('blur', abort);
  };
}

export function LayerHandles({ layer, layout, preset, start }: { layer: StockpileLayer; layout: WarehouseLayout; preset: CameraPreset; start: DragStart }) {
  const g = geometryOf(layer, layout);
  const x = sceneX((g.startPosition + g.endPosition) / 2, layout), y = sceneY(g.topLevel, layout);
  const z = ((g.startDepth + g.endDepth) / 200 - .5) * SCENE.depth;
  const handles: Array<{ mode: GeometryGesture; label: string; position: [number, number, number]; hidden?: boolean }> = [
    { mode: 'MOVE', label: 'Geser', position: [x, y + 1.2, z] },
    { mode: 'LENGTH', label: 'Panjang', position: [sceneX(g.endPosition, layout), sceneY(g.bottomLevel, layout), z] },
    { mode: 'WIDTH', label: 'Lebar', position: [x, sceneY(g.bottomLevel, layout), (g.endDepth / 100 - .5) * SCENE.depth], hidden: preset === 'SIDE' },
    { mode: 'HEIGHT', label: 'Tinggi', position: [sceneX(g.startPosition, layout), y, z], hidden: preset === 'TOP' },
  ];
  return <>{handles.filter(handle => !handle.hidden).map(handle => <Html key={handle.mode} position={handle.position} center zIndexRange={[20, 10]}>
    <button type="button" className={`pile-drag-handle pile-handle-${handle.mode.toLowerCase()}`} aria-label={`Drag ${handle.label.toLowerCase()} layer`}
      onPointerDown={event => { event.stopPropagation(); start(event.nativeEvent, layer, handle.mode); }}
      title={`Drag untuk ${handle.mode === 'MOVE' ? 'memindahkan' : 'mengubah ' + handle.label.toLowerCase()} layer; Esc untuk batal`}>
      <span>{handle.mode === 'MOVE' ? '✥' : '↔'}</span>{handle.label}
    </button>
  </Html>)}</>;
}
