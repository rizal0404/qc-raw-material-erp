import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { CounterAssignment, FleetSummary, OperationalAssignmentInput, ShiftAssignmentInput, ShiftCode, ShiftReport, ShiftReportDraftInput } from '@qc/contracts';
import { authQueryOptions } from '../../features/auth/auth-query';
import { useMaterial, useMaterialLookups } from '../../features/navigation/material-context';
import { useDraftGuard } from '../../features/navigation/use-draft-guard';
import { materialNames } from '../../features/navigation/workflow';
import {
  createShiftReport, createShiftReportRevision, equipmentLookup, getCurrentShiftReport, listShiftReports, submitShiftReport, updateShiftReportDraft,
} from '../../features/vendor/vendor-api';
import { cancelOperationalAssignment, createOperationalAssignment, listOperationalAssignments, updateOperationalAssignment } from '../../features/retase/retase-api';

export const Route=createFileRoute('/_authenticated/vendor-shift-report')({component:VendorShiftReportPage});

const today=()=>{const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const get=(type:string)=>parts.find(p=>p.type===type)?.value??'';return `${get('year')}-${get('month')}-${get('day')}`};
const emptyFleet=():FleetSummary=>({total:0,operating:0,standby:0,breakdown:0,repair:0,other:0});
const fleetDiff=(f:FleetSummary)=>f.total-(f.operating+f.standby+f.breakdown+f.repair+f.other);
const newAssignment=():LocalAssignment=>({key:crypto.randomUUID(),amId:'',sourceId:'',crusherId:'',pileId:'',blockSnapshot:'',validFrom:'',validTo:'',aaIds:[],note:'',aaSearch:''});

interface LocalAssignment {
  key:string; amId:string; sourceId:string; crusherId:string; pileId:string; blockSnapshot:string; validFrom:string; validTo:string; aaIds:string[]; note:string; aaSearch:string;
}
interface EditorState {
  am:FleetSummary; aa:FleetSummary; note:string; assignments:LocalAssignment[];
}
const blankEditor=():EditorState=>({am:emptyFleet(),aa:emptyFleet(),note:'',assignments:[]});

function fromReport(report:ShiftReport|null):EditorState{
  if(!report)return blankEditor();
  return{
    am:{...report.am},aa:{...report.aa},note:report.note??'',
    assignments:report.assignments.map(a=>({key:a.id,amId:a.amId,sourceId:a.sourceId,crusherId:a.crusherId,pileId:a.pileId??'',blockSnapshot:a.blockSnapshot??'',validFrom:a.validFrom??'',validTo:a.validTo??'',aaIds:a.aa.map(x=>x.id),note:a.note??'',aaSearch:''})),
  };
}
function fromOperational(item:CounterAssignment):LocalAssignment{return{key:item.id,amId:item.amId,sourceId:item.sourceId??'',crusherId:item.crusherId,pileId:item.pileId??'',blockSnapshot:item.blockSnapshot??'',validFrom:item.validFrom??'',validTo:item.validTo??'',aaIds:item.aa.map(x=>x.aaId),note:item.note??'',aaSearch:''};}

function FleetEditor({title,value,onChange,readonly=false}:{title:string;value:FleetSummary;onChange:(next:FleetSummary)=>void;readonly?:boolean}){
  const fields:[keyof FleetSummary,string][]=[['total','Total'],['operating','Operating'],['standby','Standby'],['breakdown','Breakdown'],['repair','Repair'],['other','Other']];
  const diff=fleetDiff(value);
  return <div className="fleet-panel"><div className="fleet-title"><strong>{title}</strong><span className={`status-badge ${diff===0?'success':'warning'}`}>{diff===0?'BALANCE':`DIFF ${diff}`}</span></div><div className="fleet-grid">{fields.map(([key,label])=><label key={key}><span>{label}</span><input type="number" min="0" disabled={readonly} value={value[key]} onChange={e=>onChange({...value,[key]:Math.max(0,Number(e.target.value)||0)})}/></label>)}</div></div>
}

function VendorShiftReportPage(){
  const qc=useQueryClient();const auth=useQuery(authQueryOptions);const user=auth.data?.user;const materialKind=useMaterial();const lookups=useMaterialLookups();
  const [operationDate,setOperationDate]=useState(today());const [shiftCode,setShiftCode]=useState<ShiftCode>('SHIFT_1');const [selectedVendorId,setSelectedVendorId]=useState(user?.vendorId??'');const [editor,setEditor]=useState<EditorState>(blankEditor());const [message,setMessage]=useState('Ready');const [revisionReason,setRevisionReason]=useState('');const [operational,setOperational]=useState<LocalAssignment>(newAssignment());const [operationalEditId,setOperationalEditId]=useState<string|null>(null);
  const effectiveVendorId=user?.role==='VENDOR'?(user.vendorId??''):selectedVendorId;
  useEffect(()=>{if(user?.role==='VENDOR'&&user.vendorId)setSelectedVendorId(user.vendorId)},[user?.role,user?.vendorId]);
  useEffect(()=>{setEditor(blankEditor());setOperational(newAssignment());setOperationalEditId(null);setMessage('Loading context...')},[operationDate,shiftCode,materialKind,effectiveVendorId]);

  const current=useQuery({queryKey:['vendor-shift-current',effectiveVendorId,operationDate,shiftCode,materialKind],queryFn:()=>getCurrentShiftReport({...(effectiveVendorId?{vendorId:effectiveVendorId}:{}),operationDate,shiftCode,materialKind}),enabled:!!effectiveVendorId&&!!operationDate});
  const history=useQuery({queryKey:['vendor-shift-history',effectiveVendorId,operationDate,shiftCode,materialKind],queryFn:()=>listShiftReports({...(effectiveVendorId?{vendorId:effectiveVendorId}:{}),operationDate,shiftCode,materialKind,limit:50,offset:0}),enabled:!!effectiveVendorId&&!!operationDate});
  const amLookup=useQuery({queryKey:['equipment-lookup',effectiveVendorId,'AM',materialKind],queryFn:()=>equipmentLookup(effectiveVendorId,'AM',materialKind),enabled:!!effectiveVendorId});
  const aaLookup=useQuery({queryKey:['equipment-lookup',effectiveVendorId,'AA',materialKind],queryFn:()=>equipmentLookup(effectiveVendorId,'AA',materialKind),enabled:!!effectiveVendorId});
  const operationalList=useQuery({queryKey:['operational-assignments',effectiveVendorId,operationDate,shiftCode,materialKind],queryFn:async()=>{const result=await listOperationalAssignments({vendorId:effectiveVendorId,operationDate,shiftCode});return {...result,items:result.items.filter(item=>item.materialKind===materialKind)}},enabled:!!effectiveVendorId&&['VENDOR','QC_ANALYST','SUPERVISOR_ADMIN'].includes(user?.role??'')});

  const report=current.data?.item??null;
  useEffect(()=>{if(current.data){setEditor(fromReport(current.data.item));setMessage(current.data.item?`Loaded ${current.data.item.status} · V${current.data.item.version}`:'Belum ada report untuk konteks ini.')}},[current.data]);

  const canWrite=user?.role==='VENDOR'||user?.role==='SUPERVISOR_ADMIN';const canManageOperational=['VENDOR','QC_ANALYST','SUPERVISOR_ADMIN'].includes(user?.role??'');const isDraft=report?.status==='DRAFT';const readonly=!!report&&!isDraft;const vendors=lookups.data?.vendors??[];
  const saveMutation=useMutation({
    mutationFn:async()=>{
      if(!effectiveVendorId)throw new Error('Vendor wajib dipilih.');
      const assignments:ShiftAssignmentInput[]=editor.assignments.map(a=>({amId:a.amId,sourceId:a.sourceId,crusherId:a.crusherId,pileId:a.pileId||null,blockSnapshot:a.blockSnapshot||null,validFrom:a.validFrom||null,validTo:a.validTo||null,aaIds:a.aaIds,note:a.note||null}));
      if(report?.status==='DRAFT')return updateShiftReportDraft(report.id,{am:editor.am,aa:editor.aa,note:editor.note||null,assignments});
      const body:ShiftReportDraftInput={vendorId:effectiveVendorId,operationDate,shiftCode,materialKind,am:editor.am,aa:editor.aa,note:editor.note||null,assignments};
      return createShiftReport(body);
    },
    onSuccess:async r=>{setMessage(`Draft tersimpan · V${r.item.version}`);setEditor(fromReport(r.item));await Promise.all([qc.invalidateQueries({queryKey:['vendor-shift-current']}),qc.invalidateQueries({queryKey:['vendor-shift-history']})]);},
    onError:e=>setMessage(e.message),
  });
  const submitMutation=useMutation({mutationFn:async()=>{if(!report?.id)throw new Error('Save Draft terlebih dahulu.');return submitShiftReport(report.id);},onSuccess:async r=>{setMessage(`Report SUBMITTED · V${r.item.version}`);await Promise.all([qc.invalidateQueries({queryKey:['vendor-shift-current']}),qc.invalidateQueries({queryKey:['vendor-shift-history']})]);},onError:e=>setMessage(e.message)});
  const revisionMutation=useMutation({mutationFn:async()=>{if(!report?.id||report.status!=='SUBMITTED')throw new Error('Revision hanya dari report SUBMITTED.');return createShiftReportRevision(report.id,{reason:revisionReason});},onSuccess:async r=>{setRevisionReason('');setMessage(`Draft revision V${r.item.version} dibuat.`);await Promise.all([qc.invalidateQueries({queryKey:['vendor-shift-current']}),qc.invalidateQueries({queryKey:['vendor-shift-history']})]);},onError:e=>setMessage(e.message)});
  const saveOperationalMutation=useMutation({mutationFn:async()=>{if(!effectiveVendorId)throw new Error('Vendor wajib dipilih.');const body:OperationalAssignmentInput={vendorId:effectiveVendorId,operationDate,shiftCode,amId:operational.amId,sourceId:operational.sourceId||null,crusherId:operational.crusherId,pileId:operational.pileId||null,blockSnapshot:operational.blockSnapshot||null,validFrom:operational.validFrom||null,validTo:operational.validTo||null,aaIds:operational.aaIds,note:operational.note||null};if(operationalEditId){const {vendorId:_vendor,operationDate:_date,shiftCode:_shift,...update}=body;return updateOperationalAssignment(operationalEditId,update);}return createOperationalAssignment(body);},onSuccess:async r=>{setMessage(`Operational assignment ${operationalEditId?'diubah':'dibuat'} · ${r.item.crusherName}`);setOperational(newAssignment());setOperationalEditId(null);await Promise.all([qc.invalidateQueries({queryKey:['operational-assignments']}),qc.invalidateQueries({queryKey:['counter-assignments']}),qc.invalidateQueries({queryKey:['counter-context']})]);},onError:e=>setMessage(e.message)});
  const cancelOperationalMutation=useMutation({mutationFn:(id:string)=>cancelOperationalAssignment(id,'Assignment dibatalkan atau unit di-routing ulang.'),onSuccess:async()=>{setMessage('Operational assignment dibatalkan.');await Promise.all([qc.invalidateQueries({queryKey:['operational-assignments']}),qc.invalidateQueries({queryKey:['counter-assignments']}),qc.invalidateQueries({queryKey:['counter-context']})]);},onError:e=>setMessage(e.message)});

  useDraftGuard(saveMutation.isPending||saveOperationalMutation.isPending||JSON.stringify(editor)!==JSON.stringify(fromReport(report))||!!operational.amId);

  function updateAssignment(index:number,patch:Partial<LocalAssignment>){setEditor(prev=>({...prev,assignments:prev.assignments.map((a,i)=>i===index?{...a,...patch}:a)}))}
  function addAssignment(){setEditor(prev=>({...prev,assignments:[...prev.assignments,newAssignment()]}))}
  function removeAssignment(index:number){setEditor(prev=>({...prev,assignments:prev.assignments.filter((_,i)=>i!==index)}))}
  const submitReady=useMemo(()=>fleetDiff(editor.am)===0&&fleetDiff(editor.aa)===0&&editor.assignments.length>0&&editor.assignments.every(a=>a.amId&&a.sourceId&&a.crusherId&&a.aaIds.length>0),[editor]);
  const operationalSource=lookups.data?.sources.find(x=>x.id===operational.sourceId);const operationalCrusher=lookups.data?.crushers.find(x=>x.id===operational.crusherId);const operationalCrushers=(lookups.data?.crushers??[]).filter(x=>x.materialKind===materialKind&&(!operationalSource||x.materialKind===operationalSource.materialKind));const operationalPiles=(lookups.data?.piles??[]).filter(x=>(!operationalCrusher||x.materialKind===operationalCrusher.materialKind)&&(!operationalCrusher?.plantId||!x.plantId||x.plantId===operationalCrusher.plantId));const operationalAaSearch=operational.aaSearch.toLowerCase();const operationalAaItems=(aaLookup.data?.items??[]).filter(x=>!operationalAaSearch||`${x.unitNo} ${x.label}`.toLowerCase().includes(operationalAaSearch));const operationalReady=!!operational.amId&&!!operational.crusherId&&operational.aaIds.length>0&&(!!operational.sourceId||operationalCrusher?.materialKind==='CL');

  return <section className="page-stack vendor-shift-page">
    <div className="page-heading"><div><p className="eyebrow">{materialNames[materialKind]} / OPERASI VENDOR</p><h1>Laporan Shift Vendor</h1><p>{materialKind==='CL'?'Laporan pendukung opsional. Laporan utama dan retase Clay tetap berjalan mandiri di Laporan Crusher.':'Atur kesiapan armada dan penugasan per shift untuk mendukung pencatatan retase Limestone.'}</p></div>{report&&<span className={`status-badge ${report.status==='SUBMITTED'?'success':report.status==='DRAFT'?'warning':'muted'}`}>{report.status} · V{report.version}</span>}</div>

    <div className="card vendor-context-grid">
      <label><span>Operation Date</span><input type="date" value={operationDate} onChange={e=>setOperationDate(e.target.value)}/></label>
      <label><span>Shift</span><select value={shiftCode} onChange={e=>setShiftCode(e.target.value as ShiftCode)}>{(lookups.data?.shifts??[]).map(s=><option key={s.code} value={s.code}>{s.label} · {s.startTime.slice(0,5)}–{s.endTime.slice(0,5)}</option>)}</select></label>
      <label><span>Material report</span><input value={materialNames[materialKind]} readOnly /></label>
      <label><span>Vendor</span>{user?.role==='VENDOR'?<input readOnly value={vendors.find(v=>v.id===effectiveVendorId)?.label??user.displayName}/>:<select value={selectedVendorId} onChange={e=>setSelectedVendorId(e.target.value)}><option value="">— pilih vendor —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select>}</label>
      <label><span>Prepared By</span><input readOnly value={report?.createdByName??user?.displayName??''}/></label>
      <label><span>Status / Version</span><input readOnly value={report?`${report.status} · V${report.version}`:'NEW DRAFT'}/></label>
      <label><span>Last Update</span><input readOnly value={report?new Date(report.updatedAt).toLocaleString('id-ID'):'—'}/></label>
    </div>

    <div className="card vendor-fleet-wrap"><FleetEditor title="Alat Muat (AM)" value={editor.am} readonly={readonly||!canWrite} onChange={am=>setEditor(p=>({...p,am}))}/><FleetEditor title="Alat Angkut (AA)" value={editor.aa} readonly={readonly||!canWrite} onChange={aa=>setEditor(p=>({...p,aa}))}/></div>

    <div className="card assignment-section">
      <div className="section-toolbar"><div><strong>Loading Assignment</strong><small>Satu AM boleh dipakai pada beberapa route Crusher/Plant/Pile. AA yang sama boleh di-routing ke crusher berbeda.</small></div>{canWrite&&!readonly&&<button className="btn primary" type="button" onClick={addAssignment}>+ Add Assignment</button>}</div>
      {!editor.assignments.length&&<div className="assignment-empty">Belum ada assignment.</div>}
      <div className="assignment-list">{editor.assignments.map((a,index)=>{
        const source=lookups.data?.sources.find(s=>s.id===a.sourceId);const crusher=lookups.data?.crushers.find(c=>c.id===a.crusherId);const crushers=(lookups.data?.crushers??[]).filter(c=>!source||c.materialKind===source.materialKind);const piles=(lookups.data?.piles??[]).filter(p=>(!crusher||p.materialKind===crusher.materialKind)&&(!crusher?.plantId||!p.plantId||p.plantId===crusher.plantId));const aaSearch=a.aaSearch.toLowerCase();const aaItems=(aaLookup.data?.items??[]).filter(x=>!aaSearch||`${x.unitNo} ${x.label}`.toLowerCase().includes(aaSearch));
        return <article key={a.key} className="assignment-card"><div className="assignment-head"><strong>Assignment #{index+1}</strong>{canWrite&&!readonly&&<button className="btn small" type="button" onClick={()=>removeAssignment(index)}>Remove</button>}</div>
          <div className="assignment-grid"><label><span>AM</span><select disabled={readonly||!canWrite} value={a.amId} onChange={e=>updateAssignment(index,{amId:e.target.value})}><option value="">— pilih AM —</option>{(amLookup.data?.items??[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label><span>Source / Block</span><select disabled={readonly||!canWrite} value={a.sourceId} onChange={e=>{const src=lookups.data?.sources.find(s=>s.id===e.target.value);updateAssignment(index,{sourceId:e.target.value,blockSnapshot:src?.block??'',crusherId:'',pileId:''})}}><option value="">— pilih source —</option>{(lookups.data?.sources??[]).filter(x=>x.materialKind===materialKind).map(x=><option key={x.id} value={x.id}>{x.label} · {x.materialKind} · {x.materialCategory}</option>)}</select></label>
          <label><span>Block Snapshot</span><input disabled={readonly||!canWrite} value={a.blockSnapshot} onChange={e=>updateAssignment(index,{blockSnapshot:e.target.value})}/></label>
          <label><span>Material</span><input readOnly value={source?`${source.materialKind} · ${source.materialCategory}`:''}/></label>
          <label><span>Crusher / Plant Destination</span><select disabled={readonly||!canWrite} value={a.crusherId} onChange={e=>updateAssignment(index,{crusherId:e.target.value,pileId:''})}><option value="">— pilih crusher —</option>{crushers.map(x=><option key={x.id} value={x.id}>{x.label}{x.plantId?` · ${lookups.data?.plants.find(p=>p.id===x.plantId)?.label??'Plant'}`:''}</option>)}</select></label>
          <label><span>Pile Destination (opsional)</span><select disabled={readonly||!canWrite||!a.crusherId} value={a.pileId} onChange={e=>updateAssignment(index,{pileId:e.target.value})}><option value="">— belum ditentukan —</option>{piles.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label><span>Start Time</span><input disabled={readonly||!canWrite} type="time" value={a.validFrom} onChange={e=>updateAssignment(index,{validFrom:e.target.value})}/></label>
          <label><span>End Time</span><input disabled={readonly||!canWrite} type="time" value={a.validTo} onChange={e=>updateAssignment(index,{validTo:e.target.value})}/></label>
          <label className="span-2"><span>Assignment Note</span><input disabled={readonly||!canWrite} value={a.note} onChange={e=>updateAssignment(index,{note:e.target.value})}/></label></div>
          <div className="aa-picker"><div className="aa-picker-head"><strong>AA / Dump Truck</strong><span>{a.aaIds.length} selected</span></div><input disabled={readonly||!canWrite} className="aa-search" placeholder="Cari nomor AA..." value={a.aaSearch} onChange={e=>updateAssignment(index,{aaSearch:e.target.value})}/><div className="aa-check-grid">{aaItems.map(x=><label key={x.id} className={`aa-check ${a.aaIds.includes(x.id)?'selected':''}`}><input disabled={readonly||!canWrite} type="checkbox" checked={a.aaIds.includes(x.id)} onChange={e=>updateAssignment(index,{aaIds:e.target.checked?[...a.aaIds,x.id]:a.aaIds.filter(id=>id!==x.id)})}/><span>{x.unitNo}</span><small>{x.label}</small></label>)}</div></div>
        </article>})}</div>
    </div>

    {canManageOperational&&<div className="card assignment-section">
      <div className="section-toolbar"><div><strong>Penugasan Operasional {materialNames[materialKind]}</strong><small>Penugasan langsung untuk material ini. Source opsional hanya untuk Clay.</small></div><span className="status-badge warning">INDEPENDENT</span></div>
      <div className="assignment-card"><div className="assignment-head"><strong>{operationalEditId?'Edit operational assignment':'Assign vendor, AM, AA & route'}</strong>{operationalEditId&&<button className="btn small" onClick={()=>{setOperational(newAssignment());setOperationalEditId(null)}}>Batal Edit</button>}</div>
        <div className="assignment-grid">
          <label><span>AM</span><select value={operational.amId} onChange={e=>setOperational(x=>({...x,amId:e.target.value}))}><option value="">— pilih AM —</option>{(amLookup.data?.items??[]).map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label><span>Source (opsional untuk Clay)</span><select value={operational.sourceId} onChange={e=>{const src=lookups.data?.sources.find(x=>x.id===e.target.value);setOperational(x=>({...x,sourceId:e.target.value,blockSnapshot:src?.block??'',crusherId:'',pileId:''}))}}><option value="">— Clay tanpa laporan/source —</option>{(lookups.data?.sources??[]).map(x=><option key={x.id} value={x.id}>{x.label} · {x.materialKind}</option>)}</select></label>
          <label><span>Block Snapshot</span><input value={operational.blockSnapshot} onChange={e=>setOperational(x=>({...x,blockSnapshot:e.target.value}))}/></label>
          <label><span>Crusher / Plant</span><select value={operational.crusherId} onChange={e=>setOperational(x=>({...x,crusherId:e.target.value,pileId:''}))}><option value="">— pilih crusher —</option>{operationalCrushers.map(x=><option key={x.id} value={x.id}>{x.label}{x.plantId?` · ${lookups.data?.plants.find(p=>p.id===x.plantId)?.label??'Plant'}`:''}</option>)}</select></label>
          <label><span>Pile Destination</span><select value={operational.pileId} disabled={!operational.crusherId} onChange={e=>setOperational(x=>({...x,pileId:e.target.value}))}><option value="">— opsional —</option>{operationalPiles.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label><span>Start Time</span><input type="time" value={operational.validFrom} onChange={e=>setOperational(x=>({...x,validFrom:e.target.value}))}/></label>
          <label><span>End Time</span><input type="time" value={operational.validTo} onChange={e=>setOperational(x=>({...x,validTo:e.target.value}))}/></label>
          <label className="span-2"><span>Note / alasan routing</span><input value={operational.note} onChange={e=>setOperational(x=>({...x,note:e.target.value}))} placeholder="Contoh: Clay direct hauling / reroute ke Crusher CL 2"/></label>
        </div>
        <div className="aa-picker"><div className="aa-picker-head"><strong>AA / Dump Truck</strong><span>{operational.aaIds.length} selected</span></div><input className="aa-search" placeholder="Cari nomor AA..." value={operational.aaSearch} onChange={e=>setOperational(x=>({...x,aaSearch:e.target.value}))}/><div className="aa-check-grid">{operationalAaItems.map(x=><label key={x.id} className={`aa-check ${operational.aaIds.includes(x.id)?'selected':''}`}><input type="checkbox" checked={operational.aaIds.includes(x.id)} onChange={e=>setOperational(a=>({...a,aaIds:e.target.checked?[...a.aaIds,x.id]:a.aaIds.filter(id=>id!==x.id)}))}/><span>{x.unitNo}</span><small>{x.label}</small></label>)}</div></div>
        <div className="inline-actions"><button className="btn primary" disabled={!operationalReady||saveOperationalMutation.isPending} onClick={()=>saveOperationalMutation.mutate()}>{saveOperationalMutation.isPending?'Saving...':operationalEditId?'Update Assignment':'Activate Assignment'}</button></div>
      </div>
      <div className="table-shell"><table className="native-table"><thead><tr><th>Status</th><th>AM / AA</th><th>Route</th><th>Window</th><th>Source</th><th>Actor</th><th>Aksi</th></tr></thead><tbody>{(operationalList.data?.items??[]).map(item=><tr key={item.id}><td><span className={`status-badge ${item.status==='ACTIVE'?'success':'muted'}`}>{item.status}</span></td><td>AM {item.amUnitNo}<small className="table-sub">AA {item.aa.map(x=>x.unitNo).join(', ')}</small></td><td>{item.crusherName}<small className="table-sub">{item.plantName??'—'} · {item.pileName??'Pile belum ditentukan'}</small></td><td>{item.validFrom&&item.validTo?`${item.validFrom}–${item.validTo}`:'Full shift'}</td><td>{item.sourceName??'Clay direct / no source'}</td><td>{item.createdByName??'—'}</td><td>{item.status==='ACTIVE'?<div className="inline-actions"><button className="btn small" onClick={()=>{setOperational(fromOperational(item));setOperationalEditId(item.id)}}>Edit</button><button className="btn small" disabled={cancelOperationalMutation.isPending} onClick={()=>cancelOperationalMutation.mutate(item.id)}>Cancel</button></div>:'—'}</td></tr>)}{!operationalList.isFetching&&!operationalList.data?.items.length&&<tr><td colSpan={7} className="table-empty">Belum ada operational assignment untuk konteks ini.</td></tr>}</tbody></table></div>
    </div>}

    <div className="card vendor-note-actions"><label className="vendor-note"><span>Report Note</span><textarea disabled={readonly||!canWrite} rows={3} value={editor.note} onChange={e=>setEditor(p=>({...p,note:e.target.value}))}/></label><div className="vendor-actions"><span className="action-status">{current.isFetching?'Loading current report...':message}</span>{canWrite&&!readonly&&<><button className="btn" disabled={saveMutation.isPending||current.isFetching||!effectiveVendorId} onClick={()=>saveMutation.mutate()}>{saveMutation.isPending?'Saving...':'Save Draft'}</button><button className="btn primary" disabled={!report||!isDraft||!submitReady||submitMutation.isPending} onClick={()=>submitMutation.mutate()}>{submitMutation.isPending?'Submitting...':'Submit'}</button></>}{canWrite&&report?.status==='SUBMITTED'&&<div className="revision-action"><input placeholder="Alasan revision..." value={revisionReason} onChange={e=>setRevisionReason(e.target.value)}/><button className="btn primary" disabled={revisionReason.trim().length<3||revisionMutation.isPending} onClick={()=>revisionMutation.mutate()}>{revisionMutation.isPending?'Creating...':'Create Revision'}</button></div>}</div></div>

    <div className="card table-card"><div className="section-toolbar"><div><strong>Version History</strong><small>Submitted version lama dipertahankan sebagai audit history.</small></div><span className="toolbar-meta">{history.data?.total??0} record</span></div><div className="table-shell"><table className="native-table"><thead><tr><th>Version</th><th>Status</th><th>Vendor</th><th>Submitted</th><th>Assignments</th><th>Prepared By</th><th>Revision Reason</th></tr></thead><tbody>{(history.data?.items??[]).map(r=><tr key={r.id}><td><span className="code-chip">V{r.version}</span></td><td><span className={`status-badge ${r.status==='SUBMITTED'?'success':r.status==='DRAFT'?'warning':'muted'}`}>{r.status}</span></td><td>{r.vendorName}</td><td>{r.submittedAt?new Date(r.submittedAt).toLocaleString('id-ID'):'—'}</td><td>{r.assignments.length}</td><td>{r.createdByName}</td><td>{r.revisionReason??'—'}</td></tr>)}{!history.data?.items.length&&<tr><td colSpan={7} className="table-empty">Belum ada history.</td></tr>}</tbody></table></div></div>
  </section>
}
