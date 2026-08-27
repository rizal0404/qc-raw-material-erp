import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import type { RetaseEvent, ShiftCode } from '@qc/contracts';
import { authQueryOptions } from '../../features/auth/auth-query';
import { useMaterialLookups } from '../../features/navigation/material-context';
import { getCounterAssignments, getCounterContext, getRetaseSummary, listRetaseEvents, recordRetase, reverseRetase } from '../../features/retase/retase-api';
import { Modal } from '../../components/modal';

export const Route=createFileRoute('/_authenticated/retase-counter')({beforeLoad:({search})=>{if(search.material==='CL')throw redirect({to:'/clay-report',search:{material:'CL'}})},component:RetaseCounterPage});

function fmtTime(value:string|null){if(!value)return '—';return new Date(value).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});}
function contextKey(crusherId:string,operationDate:string,shiftCode:ShiftCode){return {crusherId,operationDate,shiftCode};}

function RetaseCounterPage(){
  const qc=useQueryClient();
  const auth=useQuery(authQueryOptions);const user=auth.data?.user;
  const lookups=useMaterialLookups();
  const allowedCrushers=useMemo(()=>{
    const all=(lookups.data?.crushers??[]).filter(x=>x.active);
    if(user?.role==='CRUSHER_OPERATOR')return all.filter(x=>user.crusherIds.includes(x.id));
    return all;
  },[lookups.data?.crushers,user?.role,user?.crusherIds]);
  const [crusherId,setCrusherId]=useState('');const [operationDate,setOperationDate]=useState('');const [shiftCode,setShiftCode]=useState<ShiftCode>('SHIFT_1');
  const [pending,setPending]=useState<Record<string,number>>({});const [failed,setFailed]=useState<Record<string,{message:string;requestId:string}>>({});const [message,setMessage]=useState('Ready');
  const [unlistedOpen,setUnlistedOpen]=useState(false);const [unlistedUnit,setUnlistedUnit]=useState('');const [unlistedVendor,setUnlistedVendor]=useState('');const [unlistedReason,setUnlistedReason]=useState('');const [unlistedRequestId,setUnlistedRequestId]=useState<string|null>(null);
  const [reverseTarget,setReverseTarget]=useState<RetaseEvent|null>(null);const [reverseReason,setReverseReason]=useState('');const [reverseRequestId,setReverseRequestId]=useState<string|null>(null);

  useEffect(()=>{if(!crusherId&&allowedCrushers[0])setCrusherId(allowedCrushers[0].id)},[allowedCrushers,crusherId]);
  useEffect(()=>{setOperationDate('');setMessage('Loading server business context...')},[crusherId]);

  const context=useQuery({
    queryKey:['counter-context',crusherId,operationDate,shiftCode],
    queryFn:()=>getCounterContext({crusherId,...(operationDate?{operationDate,shiftCode}:{})}),
    enabled:!!crusherId,
    refetchInterval:30_000,
  });
  useEffect(()=>{
    if(!context.data)return;
    if(!operationDate){setOperationDate(context.data.requested.operationDate);setShiftCode(context.data.requested.shiftCode);}
    setMessage(context.data.canRecord?'LIVE · counter siap mencatat dump':'READ ONLY · pilih business context aktif untuk mencatat dump');
  },[context.data,operationDate]);

  const counterInput=crusherId&&operationDate?contextKey(crusherId,operationDate,shiftCode):null;
  const assignments=useQuery({queryKey:['counter-assignments',counterInput],queryFn:()=>getCounterAssignments(counterInput!),enabled:!!counterInput,refetchInterval:10_000});
  const summary=useQuery({queryKey:['retase-summary',counterInput],queryFn:()=>getRetaseSummary(counterInput!),enabled:!!counterInput,refetchInterval:10_000});
  const events=useQuery({queryKey:['retase-events',counterInput],queryFn:()=>listRetaseEvents({...counterInput!,limit:30}),enabled:!!counterInput,refetchInterval:10_000});

  const refresh=async()=>{if(!counterInput)return;await Promise.all([qc.invalidateQueries({queryKey:['counter-assignments']}),qc.invalidateQueries({queryKey:['retase-summary']}),qc.invalidateQueries({queryKey:['retase-events']}),qc.invalidateQueries({queryKey:['counter-context']})]);};

  async function tapAa(assignmentAaId:string){
    if(!counterInput||!context.data?.canRecord)return;
    const key=assignmentAaId;setPending(p=>({...p,[key]:(p[key]??0)+1}));
    const requestId=failed[key]?.requestId??crypto.randomUUID();
    try{
      const r=await recordRetase({...counterInput,requestId,assignmentAaId,clientTs:new Date().toISOString()});
      setFailed(p=>{const n={...p};delete n[key];return n});setMessage(`${r.idempotent?'Retry aman':'Dump tercatat'} · ${r.item.aaUnitNo??'AA'} · ${fmtTime(r.item.eventTs)}`);await refresh();
    }catch(e){setFailed(p=>({...p,[key]:{message:(e as Error).message,requestId}}));setMessage((e as Error).message)}
    finally{setPending(p=>({...p,[key]:Math.max(0,(p[key]??1)-1)}));}
  }

  async function submitUnlisted(){
    if(!counterInput||!context.data?.canRecord)return;
    try{
      const requestId=unlistedRequestId??crypto.randomUUID();setUnlistedRequestId(requestId);const r=await recordRetase({...counterInput,requestId,unlistedUnitNo:unlistedUnit.trim(),...(unlistedVendor?{vendorId:unlistedVendor}:{}),reason:unlistedReason.trim(),clientTs:new Date().toISOString()});
      setMessage(`Unlisted AA tercatat · ${r.item.status} · ${r.item.aaUnitNo??unlistedUnit}`);setUnlistedOpen(false);setUnlistedUnit('');setUnlistedVendor('');setUnlistedReason('');setUnlistedRequestId(null);await refresh();
    }catch(e){setMessage((e as Error).message)}
  }

  async function submitReverse(){
    if(!reverseTarget)return;
    try{
      const requestId=reverseRequestId??crypto.randomUUID();setReverseRequestId(requestId);const r=await reverseRetase(reverseTarget.id,{requestId,reason:reverseReason.trim()});setMessage(`Reversal tercatat untuk ${reverseTarget.aaUnitNo??reverseTarget.id.slice(0,8)} · ${fmtTime(r.item.eventTs)}`);setReverseTarget(null);setReverseReason('');setReverseRequestId(null);await refresh();
    }catch(e){setMessage((e as Error).message)}
  }

  const s=summary.data?.summary;const vendors=lookups.data?.vendors??[];
  return <section className="page-stack retase-counter-page">
    <div className="page-heading"><div><p className="eyebrow">LIMESTONE / OPERASI CRUSHER</p><h1>Digital Retase Counter</h1><p>Catat setiap perjalanan armada Limestone. Pilih crusher dan gunakan kartu AA untuk menambah retase.</p></div><span className={`status-badge ${context.data?.canRecord?'success':'warning'}`}>{context.data?.canRecord?'LIVE':'READ ONLY'}</span></div>

    <div className="card counter-context-grid">
      <label><span>Crusher</span><select value={crusherId} onChange={e=>setCrusherId(e.target.value)}><option value="">— pilih crusher —</option>{allowedCrushers.map(c=><option key={c.id} value={c.id}>{c.label} · {c.materialKind}</option>)}</select></label>
      <label><span>Operation Date</span><input type="date" value={operationDate} onChange={e=>setOperationDate(e.target.value)}/></label>
      <label><span>Shift</span><select value={shiftCode} onChange={e=>setShiftCode(e.target.value as ShiftCode)}>{(lookups.data?.shifts??[]).map(x=><option key={x.code} value={x.code}>{x.label} · {x.startTime.slice(0,5)}–{x.endTime.slice(0,5)}</option>)}</select></label>
      <label><span>Server Time</span><input readOnly value={context.data?`${context.data.current.localDate} ${context.data.current.localTime} WITA`:'—'}/></label>
      <label><span>Submitted Reports</span><input readOnly value={context.data?.submittedReportCount??0}/></label>
      <label><span>Operational Assignments</span><input readOnly value={context.data?.operationalAssignmentCount??0}/></label>
      <label><span>Assignments</span><input readOnly value={context.data?.assignmentCount??0}/></label>
    </div>

    <div className="counter-toolbar card"><div><strong>{message}</strong><small>{context.data?.crusher?`${context.data.crusher.name} · ${context.data.crusher.materialKind}`:'Pilih crusher.'}</small></div><div className="inline-actions"><button className="btn" onClick={()=>void refresh()} disabled={!counterInput}>Refresh</button><button className="btn primary" disabled={!context.data?.canRecord} onClick={()=>setUnlistedOpen(true)}>+ Unlisted AA</button></div></div>

    <div className="counter-kpis">
      <div className="card kpi"><span>Total Net Retase</span><strong>{s?.totalNet??0}</strong></div>
      <div className="card kpi"><span>DUMP Events</span><strong>{s?.dumpEvents??0}</strong></div>
      <div className="card kpi"><span>Reversal</span><strong>{s?.reversalEvents??0}</strong></div>
      <div className="card kpi"><span>Unassigned</span><strong>{s?.unassignedEvents??0}</strong></div>
      <div className="card kpi"><span>Ambiguous</span><strong>{s?.ambiguousEvents??0}</strong></div>
    </div>

    <div className="counter-assignment-list">
      {(assignments.data?.items??[]).map(a=><article key={a.id} className={`card counter-assignment ${a.activeNow?'active':''}`}>
        <header><div><strong>{a.vendorName} · AM {a.amUnitNo}</strong><small>{a.blockSnapshot??a.sourceName??'Clay direct'} · {a.materialCategory} · {a.crusherName}{a.plantName?` / ${a.plantName}`:''}{a.pileName?` / ${a.pileName}`:''}{a.validFrom&&a.validTo?` · ${a.validFrom}–${a.validTo}`:''}</small></div><div className="inline-actions"><span className={`status-badge ${a.assignmentOrigin==='OPERATIONAL'?'warning':'muted'}`}>{a.assignmentOrigin}</span><span className={`status-badge ${a.activeNow?'success':'muted'}`}>{a.activeNow?'ACTIVE NOW':'OUTSIDE WINDOW'}</span></div></header>
        <div className="aa-counter-grid">{a.aa.map(aa=>{const p=pending[aa.assignmentAaId]??0;const display=aa.confirmedCount+p;const err=failed[aa.assignmentAaId];return <button key={aa.assignmentAaId} type="button" className={`aa-counter-card ${p?'pending':''} ${err?'failed':''}`} disabled={!context.data?.canRecord||!a.activeNow||p>0} onClick={()=>void tapAa(aa.assignmentAaId)}><span className="aa-no">AA {aa.unitNo}</span><strong>{display}</strong><small>{p?'PENDING SYNC':err?'FAILED · tap retry same request' :aa.lastEventAt?`Last ${fmtTime(aa.lastEventAt)}`:'Belum dump'}</small></button>})}</div>
      </article>)}
      {!assignments.isFetching&&!assignments.data?.items.length&&<div className="card counter-empty"><strong>Belum ada assignment aktif.</strong><span>Submit Laporan Shift Vendor atau buat Penugasan Operasional Limestone untuk Operation Date, Shift, dan Crusher ini.</span></div>}
    </div>

    <div className="counter-bottom-grid">
      <div className="card table-card"><div className="section-toolbar"><div><strong>Hourly Retase</strong><small>Derived dari server event timestamp Asia/Makassar.</small></div></div><div className="table-shell"><table className="native-table"><thead><tr><th>Jam</th><th>Net Retase</th></tr></thead><tbody>{(s?.hourly??[]).map(x=><tr key={x.hour}><td><span className="code-chip">{x.hour}</span></td><td>{x.retase}</td></tr>)}{!s?.hourly.length&&<tr><td colSpan={2} className="table-empty">Belum ada event.</td></tr>}</tbody></table></div></div>
      <div className="card table-card"><div className="section-toolbar"><div><strong>Retase per AA</strong><small>Net = DUMP + reversal delta.</small></div></div><div className="table-shell"><table className="native-table"><thead><tr><th>AA</th><th>Retase</th></tr></thead><tbody>{(s?.byAa??[]).map((x,i)=><tr key={`${x.id??'x'}-${i}`}><td>{x.label}</td><td>{x.retase}</td></tr>)}{!s?.byAa.length&&<tr><td colSpan={2} className="table-empty">Belum ada data.</td></tr>}</tbody></table></div></div>
    </div>

    <div className="card table-card"><div className="section-toolbar"><div><strong>Recent Event Ledger</strong><small>Original DUMP tidak dihapus. Undo membuat REVERSAL -1.</small></div><span className="toolbar-meta">{events.data?.total??0} event</span></div><div className="table-shell"><table className="native-table counter-event-table"><thead><tr><th>Time</th><th>AA</th><th>Vendor / AM</th><th>Delta</th><th>Status</th><th>Actor</th><th>Reason</th><th>Aksi</th></tr></thead><tbody>{(events.data?.items??[]).map(e=><tr key={e.id}><td>{fmtTime(e.eventTs)}</td><td><strong>{e.aaUnitNo??'UNLISTED'}</strong></td><td>{e.vendorName??'—'}<small className="table-sub">AM {e.amUnitNo??'—'}</small></td><td><span className={`event-delta ${e.delta>0?'positive':'negative'}`}>{e.delta>0?'+1':'-1'}</span></td><td><span className={`status-badge ${e.status==='VALID'?'success':e.status==='REVERSED'?'muted':'warning'}`}>{e.status}</span></td><td>{e.createdByName}</td><td>{e.reason??'—'}</td><td>{e.canReverse?<button className="btn small" onClick={()=>{setReverseTarget(e);setReverseReason('');setReverseRequestId(null)}}>{user?.role==='CRUSHER_OPERATOR'?'Undo Last':'Reverse'}</button>:'—'}</td></tr>)}{!events.data?.items.length&&<tr><td colSpan={8} className="table-empty">Belum ada event.</td></tr>}</tbody></table></div></div>

    {unlistedOpen&&<Modal title="Record Unlisted AA" subtitle="Digunakan jika unit dump tidak ada pada assignment. Event tidak otomatis masuk QC mapping bila unresolved." onClose={()=>{setUnlistedOpen(false);setUnlistedRequestId(null)}} footer={<><button className="btn" onClick={()=>{setUnlistedOpen(false);setUnlistedRequestId(null)}}>Batal</button><button className="btn primary" disabled={!unlistedUnit.trim()||unlistedReason.trim().length<3} onClick={()=>void submitUnlisted()}>Record +1</button></>}><div className="form-grid"><label><span>No AA / DT</span><input value={unlistedUnit} onChange={e=>setUnlistedUnit(e.target.value.toUpperCase())} placeholder="Contoh: 112"/></label><label><span>Vendor (jika diketahui)</span><select value={unlistedVendor} onChange={e=>setUnlistedVendor(e.target.value)}><option value="">— unknown —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label className="span-2"><span>Reason</span><input value={unlistedReason} onChange={e=>setUnlistedReason(e.target.value)} placeholder="Contoh: Unit pengganti belum masuk assignment"/></label></div></Modal>}
    {reverseTarget&&<Modal title={user?.role==='CRUSHER_OPERATOR'?'Undo Last Retase':'Reverse Retase Event'} subtitle={`${reverseTarget.aaUnitNo??'AA'} · ${fmtTime(reverseTarget.eventTs)} · original event tetap tersimpan`} onClose={()=>{setReverseTarget(null);setReverseRequestId(null)}} footer={<><button className="btn" onClick={()=>{setReverseTarget(null);setReverseRequestId(null)}}>Batal</button><button className="btn primary" disabled={reverseReason.trim().length<3} onClick={()=>void submitReverse()}>Simpan REVERSAL -1</button></>}><div className="form-grid"><label className="span-2"><span>Reason</span><input autoFocus value={reverseReason} onChange={e=>setReverseReason(e.target.value)} placeholder="Alasan koreksi wajib"/></label></div></Modal>}
  </section>
}
