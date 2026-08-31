import { LayerHandles, useLayerDrag } from './layer-drag-controls';
import type { DragStart } from './layer-drag-controls';
import type { SceneLayerEditor } from './use-layer-editor';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Edges, Html, OrbitControls } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { OrthographicCamera } from 'three';
import type { StockpileLayer } from './stockpile-map-api';
import { positionLabel } from './warehouse-map';
import { createLayerColorScale, formatValue, layerVertices, LAYER_INDICES, periodLabel, SCENE, sceneX, sceneY } from './stockpile-visual-model';
import type { CameraPreset, WarehouseMapProps } from './stockpile-visual-model';

type SceneProps = WarehouseMapProps & {
  editor?: SceneLayerEditor;
  cameraPreset: CameraPreset;
  resetKey: number;
  separation: number;
  isolate: boolean;
  onUnavailable: () => void;
};

function CameraRig({ preset, resetKey, onUnavailable, editing }: { editing: boolean; preset: CameraPreset; resetKey: number; onUnavailable: () => void }) {
  const { camera, size, gl, invalidate } = useThree();
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  useEffect(() => {
    const targetY = 1.5;
    const positions = { PERSPECTIVE: [18, 23, 32], SIDE: [0, targetY, 40], TOP: [0, 40, .001] } as const;
    const [x, y, z] = positions[preset];
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, targetY, 0);
    const ortho = camera as OrthographicCamera;
    ortho.zoom = Math.min(size.width / 39, size.height / (preset === 'PERSPECTIVE' ? 25 : 18));
    ortho.updateProjectionMatrix();
    controls.current?.target.set(0, targetY, 0);
    controls.current?.update();
    invalidate();
  }, [camera, size.width, size.height, preset, resetKey, invalidate]);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onUnavailable(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onUnavailable]);
  return <OrbitControls enabled={!editing} ref={controls} makeDefault enableDamping={false} minZoom={4} maxZoom={110}
    minPolarAngle={0} maxPolarAngle={Math.PI / 2} enableRotate={preset === 'PERSPECTIVE'} />;
}

function LayerMesh({ layer, props, color, onHover, start }: { start: DragStart; layer: StockpileLayer; props: SceneProps; color: string; onHover: (id: string | null) => void }) {
  const { data, separation, selectedLayerId, isolate, onSelectLayer } = props;
  const vertices = useMemo(() => layerVertices(layer, data.layout, separation), [layer, data.layout, separation]);
  const geometry = useMemo(() => {
    const result = new BufferGeometry();
    result.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    result.setIndex(LAYER_INDICES);
    result.computeVertexNormals();
    return result;
  }, [vertices]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const selected = selectedLayerId === layer.id;
  const dimmed = (isolate && selectedLayerId !== null && !selected) || (layer.lotStatus === 'RECLAIMED' && !selected);
  const [hovered, setHovered] = useState(false);
  return <mesh geometry={geometry}
    onClick={event => { event.stopPropagation(); onSelectLayer(layer); }}
    onDoubleClick={event => { event.stopPropagation(); props.editor?.onDimensions(layer); }}
    onPointerDown={event => { if (props.editor?.enabled) { event.stopPropagation(); onSelectLayer(layer); start(event.nativeEvent, layer, 'MOVE'); } }}
    onPointerOver={event => { event.stopPropagation(); setHovered(true); onHover(layer.id); }}
    onPointerOut={() => { setHovered(false); onHover(null); }}>
    <meshStandardMaterial color={color} roughness={.86} metalness={.02} flatShading
      transparent={dimmed} opacity={dimmed ? .17 : 1} depthWrite={!dimmed}
      emissive={selected || hovered ? color : '#000000'} emissiveIntensity={selected ? .22 : .1} />
    <Edges threshold={20} color={selected ? '#102e43' : layer.qualityStatus === 'CHECK' ? '#aa5e12' : '#456575'} opacity={dimmed ? .15 : .65} transparent />
  </mesh>;
}

function Structure({ data, recPosition }: SceneProps) {
  const { layout, zones, lots, layers } = data;
  const railZ = SCENE.depth / 2 + .8;
  return <group>
    <mesh position={[0, -.18, 0]}><boxGeometry args={[SCENE.length + 2, .3, SCENE.depth + 3.5]} /><meshStandardMaterial color="#dce6eb" roughness={1} /></mesh>
    <gridHelper args={[SCENE.length, 30, '#bdcdd7', '#cddae2']} scale={[1, 1, SCENE.depth / SCENE.length]} position={[0, -.015, 0]} />
    {[-railZ, railZ].map(z => <group key={z}>
      <mesh position={[0, .03, z]}><boxGeometry args={[SCENE.length + .3, .11, .1]} /><meshStandardMaterial color="#6a8696" /></mesh>
      {layout.postMarks.map(mark => <group key={`${mark.position}-${mark.label}`} position={[sceneX(mark.position, layout), 0, z]}>
        <mesh position={[0, .24, 0]}><boxGeometry args={[.1, .48, .1]} /><meshStandardMaterial color="#7894a4" /></mesh>
        {z > 0 && <Html position={[0, .02, .7]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}><span className="pile-post-label">{mark.label}</span></Html>}
      </group>)}
    </group>)}
    {zones.map(zone => <group key={zone.id}>
      <mesh position={[(sceneX(zone.startPosition, layout) + sceneX(zone.endPosition, layout)) / 2,
        (sceneY(zone.topLevel, layout) + sceneY(zone.bottomLevel, layout)) / 2, 0]}>
        <boxGeometry args={[(zone.endPosition - zone.startPosition) / layout.axisLength * SCENE.length,
          (zone.topLevel - zone.bottomLevel) / layout.maxLevel * SCENE.height, SCENE.depth + .1]} />
        <meshStandardMaterial color={zone.kind === 'DIVIDER' ? '#698196' : '#92adaf'} transparent opacity={.18} depthWrite={false} />
        <Edges color="#91a5b1" transparent opacity={.35} />
      </mesh>
      <Html position={[(sceneX(zone.startPosition, layout) + sceneX(zone.endPosition, layout)) / 2, .1, -railZ - .6]} center zIndexRange={[3, 0]} style={{ pointerEvents: 'none' }}><span className="pile-zone-label">{zone.label}</span></Html>
    </group>)}
    {lots.map(lot => {
      const items = layers.filter(layer => layer.lotId === lot.id);
      if (!items.length) return null;
      const center = (Math.min(...items.map(layer => layer.startPosition)) + Math.max(...items.map(layer => layer.endPosition))) / 2;
      return <Html key={lot.id} position={[sceneX(center, layout), 0, -railZ - 1.1]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}>
        <span className="pile-lot-label"><b>LOT {lot.lotNo}</b><small>{lot.logicalPileName} · {items.length} layer</small></span>
      </Html>;
    })}
    <group position={[layout.hopperSide === 'START' ? -SCENE.length / 2 - 1.9 : SCENE.length / 2 + 1.9, .7, 0]}>
      <mesh><cylinderGeometry args={[.8, .4, 1.4, 4]} /><meshStandardMaterial color="#6994ac" roughness={.7} /></mesh>
      <Html position={[0, 1.3, 0]} center zIndexRange={[4, 0]} style={{ pointerEvents: 'none' }}><span className="pile-zone-label">HOPPER</span></Html>
    </group>
    <group position={[sceneX(recPosition, layout), 0, 0]}>
      {[-railZ, railZ].map(z => <mesh key={z} position={[0, (SCENE.height + 1) / 2, z]}><boxGeometry args={[.17, SCENE.height + 1, .2]} /><meshStandardMaterial color="#258dab" /></mesh>)}
      <mesh position={[0, SCENE.height + 1, 0]}><boxGeometry args={[.3, .24, railZ * 2 + .2]} /><meshStandardMaterial color="#137992" /></mesh>
      <Html position={[0, SCENE.height + 1.7, 0]} center zIndexRange={[6, 0]} style={{ pointerEvents: 'none' }}><span className="pile-rec-label">REC · {formatValue(recPosition, 1)}</span></Html>
    </group>
  </group>;
}

function EditableLayers({ props, colorFor, onHover }: { props: SceneProps; colorFor: (layer: StockpileLayer) => string; onHover: (id: string | null) => void }) {
  const start = useLayerDrag(props.data.layout, props.cameraPreset, props.editor);
  const selected = props.data.layers.find(layer => layer.id === props.selectedLayerId);
  return <>
    {props.data.layers.map(layer => <LayerMesh key={layer.id} layer={layer} props={props} color={colorFor(layer)} onHover={onHover} start={start} />)}
    {props.editor?.enabled && selected?.lotStatus === 'ACTIVE' && <LayerHandles layer={selected} layout={props.data.layout} preset={props.cameraPreset} start={start} />}
  </>;
}

export default function WarehouseScene3D(props: SceneProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Probe before mounting Canvas: asynchronous renderer initialization errors
    // are not guaranteed to reach a React error boundary on every browser.
    try {
      const probe = document.createElement('canvas');
      const context = probe.getContext('webgl2');
      if (!context) { props.onUnavailable(); return; }
      context.getExtension('WEBGL_lose_context')?.loseContext();
      setReady(true);
    } catch { props.onUnavailable(); }
  }, [props.onUnavailable]);
  const colorFor = useMemo(() => createLayerColorScale(props.colorMode, props.data), [props.colorMode, props.data]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const hovered = props.data.layers.find(layer => layer.id === hoveredId);
  const primary = props.data.layout.materialKind === 'CL' ? 'SM' : 'LSF';
  if (!ready) return <div className="pile-scene-loading" role="status">Memeriksa dukungan 3D…</div>;
  return <div className="pile-scene" onPointerLeave={() => setHoveredId(null)}>
    <Canvas orthographic camera={{ position: [18, 23, 32], zoom: 20, near: .1, far: 300 }} dpr={[1, 1.5]}
      frameloop="demand" gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      aria-label={`Peta pile 3D skematis ${props.data.layout.name}`}>
      <ambientLight intensity={1.65} />
      <directionalLight position={[0, 20, 14]} intensity={2.1} />
      <directionalLight position={[-10, 8, -12]} intensity={.5} />
      <CameraRig editing={!!props.editor?.enabled} preset={props.cameraPreset} resetKey={props.resetKey} onUnavailable={props.onUnavailable} />
      <Structure {...props} />
      <EditableLayers props={props} colorFor={colorFor} onHover={setHoveredId} />
    </Canvas>
    <div className="pile-scene-badge"><span /> PILE VIEW <b>3D SKEMATIS</b></div>
    {hovered && <div className="pile-hover-card" role="status">
      <strong>{hovered.label || `Lot ${hovered.lotNo}`}</strong><span>{periodLabel(hovered)}</span>
      <small>{positionLabel(hovered.startPosition, props.data.layout.postMarks)} → {positionLabel(hovered.endPosition, props.data.layout.postMarks)}</small>
      <div><b>{formatValue(hovered.totalTon, 0)} t</b><b>{primary} {formatValue(primary === 'SM' ? hovered.quality.sm : hovered.quality.lsf)}</b><b>{hovered.qualityStatus}</b></div>
    </div>}
    <div className="pile-scene-hint">{props.editor?.enabled ? 'Drag layer/handle · Esc batal · double-click edit ukuran' : <>{props.cameraPreset === 'PERSPECTIVE' ? 'Drag untuk putar · ' : ''}Scroll untuk zoom · klik layer untuk inspeksi</>}</div>
  </div>;
}
