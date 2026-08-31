import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { StockpileLayer, StockpileLot } from './stockpile-map-api';
import { contrastColor, createLayerColorScale, periodLabel } from './stockpile-visual-model';
import type { WarehouseMapProps } from './stockpile-visual-model';

const WIDTH=1200,LEFT=74,RIGHT=36,TOP=64,BOTTOM=298,LEVEL_HEIGHT=BOTTOM-TOP;
const fmt=(value:number|null|undefined,digits=2)=>value===null||value===undefined||!Number.isFinite(value)?'—':value.toLocaleString('id-ID',{maximumFractionDigits:digits});

export function positionLabel(position:number,marks:Array<{position:number;label:string}>):string{
  if(!marks.length)return fmt(position,2);
  const nearest=marks.reduce((best,mark)=>Math.abs(mark.position-position)<Math.abs(best.position-position)?mark:best,marks[0]!);
  const delta=position-nearest.position;
  return Math.abs(delta)<.001?`Tiang ${nearest.label}`:`${fmt(position,2)} (dekat tiang ${nearest.label})`;
}

function layerLabel(layer:StockpileLayer){if(layer.label)return layer.label;const clay=layer.mixes[0]?.materialKind==='CL';return clay?`Lot ${layer.lotNo} · SM ${fmt(layer.quality.sm)} · AM ${fmt(layer.quality.am)}`:`Lot ${layer.lotNo} · LSF ${fmt(layer.quality.lsf,0)}`;}

export function WarehouseMap({data,colorMode,selectedLayerId,onSelectLayer,recPosition,onRecPositionChange,readOnly=false}:WarehouseMapProps){
  const svgRef=useRef<SVGSVGElement>(null);const{layout,layers,zones}=data;
  const colors=useMemo(()=>{const scale=createLayerColorScale(colorMode,data);return new Map(layers.map(layer=>[layer.id,scale(layer)]));},[data,colorMode,layers]);
  const x=(position:number)=>LEFT+(position/layout.axisLength)*(WIDTH-LEFT-RIGHT);
  const y=(level:number)=>BOTTOM-(level/layout.maxLevel)*LEVEL_HEIGHT;
  const pointerPosition=(event:ReactPointerEvent<SVGRectElement>)=>{const svg=svgRef.current;if(!svg)return recPosition;const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;const transformed=point.matrixTransform(svg.getScreenCTM()?.inverse());return Math.max(0,Math.min(layout.axisLength,((transformed.x-LEFT)/(WIDTH-LEFT-RIGHT))*layout.axisLength));};
  const startDrag=(event:ReactPointerEvent<SVGRectElement>)=>{if(readOnly)return;event.currentTarget.setPointerCapture(event.pointerId);onRecPositionChange(Math.round(pointerPosition(event)*100)/100);};
  const moveDrag=(event:ReactPointerEvent<SVGRectElement>)=>{if(!readOnly&&event.currentTarget.hasPointerCapture(event.pointerId))onRecPositionChange(Math.round(pointerPosition(event)*100)/100);};
  const keyMove=(key:string)=>{const delta=key==='ArrowLeft'?-0.1:key==='ArrowRight'?0.1:0;if(delta)onRecPositionChange(Math.max(0,Math.min(layout.axisLength,Math.round((recPosition+delta)*100)/100)));};
  return <div className="stockpile-map-scroll"><svg ref={svgRef} className="stockpile-map-svg" viewBox={`0 0 ${WIDTH} 360`} role="img" aria-label={`Peta mutu ${layout.name}`}>
    <title>Peta mutu {layout.name}</title><desc>Layer material digambar menurut rentang posisi dan level fisik. REC dapat digeser bebas di sepanjang gudang.</desc>
    <rect x={LEFT} y={TOP-18} width={WIDTH-LEFT-RIGHT} height={14} className="warehouse-rail"/><rect x={LEFT} y={BOTTOM+4} width={WIDTH-LEFT-RIGHT} height={14} className="warehouse-rail"/>
    {layout.postMarks.map((mark)=><g key={`${mark.position}-${mark.label}`}><line x1={x(mark.position)} y1={TOP-20} x2={x(mark.position)} y2={BOTTOM+18} className="warehouse-post-line"/><text x={x(mark.position)} y={TOP-28} textAnchor="middle" className="warehouse-post-label">{mark.label}</text><text x={x(mark.position)} y={BOTTOM+37} textAnchor="middle" className="warehouse-post-label">{mark.label}</text></g>)}
    {zones.map((zone)=><g key={zone.id}><rect x={x(zone.startPosition)} y={y(zone.topLevel)} width={Math.max(2,x(zone.endPosition)-x(zone.startPosition))} height={Math.max(2,y(zone.bottomLevel)-y(zone.topLevel))} className={`warehouse-zone zone-${zone.kind.toLowerCase()}`}/><text x={(x(zone.startPosition)+x(zone.endPosition))/2} y={(y(zone.topLevel)+y(zone.bottomLevel))/2} dominantBaseline="middle" textAnchor="middle" className="warehouse-zone-label">{zone.label}</text></g>)}
    <line x1={LEFT} y1={BOTTOM} x2={WIDTH-RIGHT} y2={BOTTOM} className="warehouse-floor"/>
    {layers.map((layer)=>{const lx=x(layer.startPosition),ly=y(layer.topLevel),lw=Math.max(3,x(layer.endPosition)-lx),lh=Math.max(3,y(layer.bottomLevel)-ly),color=colors.get(layer.id)!;return <g key={layer.id} className={`stockpile-layer ${selectedLayerId===layer.id?'selected':''}`} onClick={()=>onSelectLayer(layer)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelectLayer(layer);}}} role="button" tabIndex={0} aria-label={layerLabel(layer)}><title>{layerLabel(layer)} · {periodLabel(layer)} · {positionLabel(layer.startPosition,layout.postMarks)} sampai {positionLabel(layer.endPosition,layout.postMarks)}</title><rect x={lx} y={ly} width={lw} height={lh} style={{fill:color}}/>{lw>72&&lh>25&&<text x={lx+lw/2} y={ly+lh/2} dominantBaseline="middle" textAnchor="middle" style={{fill:contrastColor(color)}}>{layerLabel(layer)}</text>}</g>;})}
    {layout.hopperSide==='START'?<g className="warehouse-hopper"><path d={`M 8 ${TOP+30} L 55 ${TOP+30} L 46 ${TOP+88} L 18 ${TOP+88} Z`}/><text x="31" y={TOP+59} textAnchor="middle">HOPPER</text></g>:<g className="warehouse-hopper"><path d={`M ${WIDTH-58} ${TOP+30} L ${WIDTH-11} ${TOP+30} L ${WIDTH-20} ${TOP+88} L ${WIDTH-48} ${TOP+88} Z`}/><text x={WIDTH-34} y={TOP+59} textAnchor="middle">HOPPER</text></g>}
    <g className={`reclaimer-handle ${readOnly?'read-only':''}`}><rect x={x(recPosition)-13} y={TOP-31} width="26" height={BOTTOM-TOP+62} rx="3" role="slider" aria-label={`Posisi REC ${positionLabel(recPosition,layout.postMarks)}`} aria-valuemin={0} aria-valuemax={layout.axisLength} aria-valuenow={recPosition} aria-disabled={readOnly} tabIndex={readOnly?-1:0} onPointerDown={startDrag} onPointerMove={moveDrag} onKeyDown={(event)=>{if(!readOnly&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();keyMove(event.key);}}}/><text x={x(recPosition)} y={TOP-10} textAnchor="middle">REC</text></g>
  </svg></div>;
}

export function SelectedLayerDetails({layer,lot,onEdit,onEditLot,onToggleLot,readOnly=false,busy=false,marks=[]}:{layer:StockpileLayer|null;lot:StockpileLot|null;onEdit:()=>void;onEditLot:()=>void;onToggleLot:()=>void;readOnly?:boolean;busy?:boolean;marks?:Array<{position:number;label:string}>}){
  if(!layer||!lot)return <aside className="card stockpile-detail empty"><strong>Inspeksi pile</strong><span>Klik layer pada peta atau daftar layer untuk melihat tanggal Mix, chemistry, mutu, dan posisi tiangnya.</span></aside>;
  return <aside className="card stockpile-detail"><header><div><span className="card-label">LOT FISIK</span><h2>{lot.lotNo}</h2><small>{lot.logicalPileName} · cycle {lot.pileCycle}</small></div><span className={`status-badge ${layer.qualityStatus==='OK'?'success':layer.qualityStatus==='CHECK'?'warning':'muted'}`}>{layer.qualityStatus==='NO_DATA'?'NO DATA':layer.qualityStatus}</span></header>
    <div className="stockpile-detail-kpis"><div><span>{layer.mixes[0]?.materialKind==='CL'?'SM':'LSF'}</span><strong>{fmt(layer.mixes[0]?.materialKind==='CL'?layer.quality.sm:layer.quality.lsf,2)}</strong></div><div><span>Tonase</span><strong>{fmt(layer.totalTon,0)} t</strong></div><div><span>Level</span><strong>{fmt(layer.bottomLevel)}–{fmt(layer.topLevel)}</strong></div><div><span>Mix</span><strong>{layer.mixes.length}</strong></div></div>
    <div className="pile-detail-position"><strong>{periodLabel(layer)}</strong><span>{positionLabel(layer.startPosition,marks)} → {positionLabel(layer.endPosition,marks)}</span><small>Perkiraan periode pengisian dari tanggal operasi Mix, bukan timestamp isi aktual.</small></div>
    <dl className="stockpile-chemistry" aria-label="Geometri tersimpan"><div><dt>Panjang</dt><dd>{fmt(layer.endPosition-layer.startPosition)} sumbu</dd></div><div><dt>Tinggi</dt><dd>{fmt(layer.topLevel-layer.bottomLevel)} level</dd></div>{layer.startDepth !== undefined && layer.endDepth !== undefined && <><div><dt>Lebar dasar</dt><dd>{fmt(layer.endDepth-layer.startDepth)}%</dd></div><div><dt>Melintang</dt><dd>{fmt(layer.startDepth)}–{fmt(layer.endDepth)}%</dd></div></>}<div><dt>Versi layer</dt><dd>{layer.version}</dd></div></dl>
    <dl className="stockpile-chemistry"><div><dt>SiO₂</dt><dd>{fmt(layer.chemistry.sio2)}</dd></div><div><dt>Al₂O₃</dt><dd>{fmt(layer.chemistry.al2o3)}</dd></div><div><dt>Fe₂O₃</dt><dd>{fmt(layer.chemistry.fe2o3)}</dd></div><div><dt>CaO</dt><dd>{fmt(layer.chemistry.cao)}</dd></div><div><dt>MgO</dt><dd>{fmt(layer.chemistry.mgo)}</dd></div><div><dt>SM / AM</dt><dd>{fmt(layer.quality.sm)} / {fmt(layer.quality.am)}</dd></div></dl>
    <div className="stockpile-mix-list"><strong>Sumber Mix Summary</strong>{layer.mixes.map((mix)=><span key={mix.mixId}><b>{mix.mixCode}</b><small>{mix.operationDate} · {fmt(mix.totalTon,0)} t</small></span>)}</div>
    {readOnly?<div className="stockpile-read-only-note">Snapshot historis · perubahan dinonaktifkan</div>:<div className="inline-actions"><button className="btn small primary" type="button" disabled={busy||lot.status==='RECLAIMED'} onClick={onEdit}>Edit layer</button><button className="btn small" type="button" disabled={busy} onClick={onEditLot}>Edit nomor lot</button><button className="btn small" type="button" disabled={busy} onClick={onToggleLot}>{lot.status==='ACTIVE'?'Tandai reclaimed':'Aktifkan kembali'}</button></div>}
  </aside>;
}
