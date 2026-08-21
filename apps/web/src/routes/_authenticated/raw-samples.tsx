import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { Chemistry, MaterialKind } from '@qc/contracts';
import { Modal } from '../../components/modal';
import { equipmentLookupQueryOptions } from '../../features/master/master-api';
import { createSample, listSamples, masterLookups, qualityOf, type RawSampleView } from '../../features/qc/qc-api';
import { businessDateToday } from '../../lib/business-date';

export const Route=createFileRoute('/_authenticated/raw-samples')({component:RawSamplesPage});
const emptyChem:Chemistry={sio2:null,al2o3:null,fe2o3:null,cao:null,mgo:null,k2o:null,na2o:null,so3:null,h2o:null};
const today=businessDateToday;
const fmt=(v:number|null,d=2)=>v===null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{maximumFractionDigits:d});
const oxideKeys=['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;

interface RawSampleForm {
  sampleId:string;operationDate:string;noSample:string;sourceShift:string;typeGrade:string;vendorId:string;sourceId:string;sourceText:string;
  loaderUnitNo:string;block:string;direction:string;note:string;chemistry:Chemistry;
}

function blankForm(operationDate:string):RawSampleForm {
  return {sampleId:'',operationDate,noSample:'',sourceShift:'',typeGrade:'',vendorId:'',sourceId:'',sourceText:'',loaderUnitNo:'',block:'',direction:'',note:'',chemistry:{...emptyChem}};
}

function uniqueStrings(values:Array<string|null|undefined>):string[] {
  const seen=new Set<string>();
  return values.flatMap(value=>{
    const clean=value?.trim();
    if(!clean)return[];
    const key=clean.toLocaleLowerCase('id-ID');
    if(seen.has(key))return[];
    seen.add(key);
    return[clean];
  });
}

function RawSamplesPage(){
  const qc=useQueryClient();const [kind,setKind]=useState<MaterialKind>('LS');const [date,setDate]=useState(today());const [search,setSearch]=useState('');const [open,setOpen]=useState(false);
  const [form,setForm]=useState<RawSampleForm>(()=>blankForm(today()));
  const lookups=useQuery({queryKey:['lookups','master'],queryFn:masterLookups});
  const samples=useQuery({queryKey:['samples',kind,date,search],queryFn:()=>listSamples({materialKind:kind,operationDate:date,search,limit:500,offset:0})});
  const vendorSamples=useQuery({queryKey:['sample-field-options',kind,form.vendorId],queryFn:()=>listSamples({materialKind:kind,vendorId:form.vendorId,limit:500,offset:0}),enabled:open&&!!form.vendorId,staleTime:60_000});
  const equipment=useQuery({...equipmentLookupQueryOptions(form.vendorId||undefined,'AM'),enabled:open&&!!form.vendorId});
  const mutation=useMutation({mutationFn:()=>{
    const {sourceText,...sample}=form;
    return createSample({...sample,materialKind:kind,vendorId:form.vendorId||null,sourceId:form.sourceId||null,sourceSnapshot:form.sourceId?null:sourceText.trim()||null,noSample:form.noSample||null,sourceShift:form.sourceShift||null,typeGrade:form.typeGrade||null,loaderUnitNo:form.loaderUnitNo||null,block:form.block||null,direction:form.direction||null,note:form.note||null});
  },onSuccess:async()=>{setOpen(false);await Promise.all([qc.invalidateQueries({queryKey:['samples']}),qc.invalidateQueries({queryKey:['sample-field-options']})]);}});
  const vendors=lookups.data?.vendors??[];const sources=(lookups.data?.sources??[]).filter(x=>x.materialKind===kind);
  const rows=samples.data?.items??[];const history=vendorSamples.data?.items??[];
  const quality=useMemo(()=>qualityOf(form.chemistry),[form.chemistry]);
  const loaderOptions=useMemo(()=>uniqueStrings([...(equipment.data?.items??[]).map(x=>x.unitNo),...history.map(x=>x.loaderUnitNo)]),[equipment.data?.items,history]);
  const blockOptions=useMemo(()=>uniqueStrings([...sources.map(x=>x.block),...history.map(x=>x.block)]),[sources,history]);
  const directionOptions=useMemo(()=>uniqueStrings(history.map(x=>x.direction)),[history]);
  const sourceOptions=useMemo(()=>{
    const master=sources.map(x=>({value:x.label,label:x.code}));
    const seen=new Set(master.map(x=>x.value.toLocaleLowerCase('id-ID')));
    const historical=history.flatMap(x=>{
      const value=x.sourceSnapshot?.trim();
      if(!value||seen.has(value.toLocaleLowerCase('id-ID')))return[];
      seen.add(value.toLocaleLowerCase('id-ID'));
      return[{value,label:'Riwayat vendor'}];
    });
    return[...master,...historical];
  },[sources,history]);
  const setChem=(key:keyof Chemistry,value:string)=>setForm(f=>({...f,chemistry:{...f.chemistry,[key]:value===''?null:Number(value)}}));
  const setVendor=(vendorId:string)=>setForm(f=>({...f,vendorId,sourceId:'',sourceText:'',loaderUnitNo:'',block:'',direction:''}));
  const setSource=(sourceText:string)=>{
    const normalized=sourceText.trim().toLocaleLowerCase('id-ID');
    const selected=sources.find(source=>source.label.toLocaleLowerCase('id-ID')===normalized||source.code.toLocaleLowerCase('id-ID')===normalized);
    setForm(f=>({...f,sourceText,sourceId:selected?.id??'',block:selected?.block??f.block}));
  };
  return <section className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">SLICE 03 / RAW SAMPLE</p><h1>Raw Sample Laboratory</h1><p>Single native database untuk Limestone dan Clay, dengan quality value dihitung dari shared formula engine.</p></div><button className="btn primary" type="button" onClick={()=>{setForm(blankForm(date));setOpen(true)}}>+ Sample</button></div>
    <div className="card toolbar-card"><select value={kind} onChange={e=>setKind(e.target.value as MaterialKind)}><option value="LS">Limestone</option><option value="CL">Clay</option></select><input type="date" value={date} onChange={e=>setDate(e.target.value)}/><input placeholder="Cari Sample ID / vendor / source..." value={search} onChange={e=>setSearch(e.target.value)}/><span className="toolbar-meta">{samples.data?.total??0} sample</span></div>
    <div className="card table-card"><div className="table-shell"><table className="native-table qc-wide"><thead><tr><th>Sample ID</th><th>No Sample</th><th>Type/Grade</th><th>Vendor</th><th>Source</th><th>CaO</th><th>LSF</th><th>SM</th><th>AM</th><th>NaEq</th><th>Loader</th><th>Block</th></tr></thead><tbody>{rows.length?rows.map((r:RawSampleView)=><tr key={r.id}><td><strong>{r.sampleId}</strong><small className="table-sub">{r.operationDate}</small></td><td>{r.noSample??'—'}</td><td>{r.typeGrade??'—'}</td><td>{r.vendorSnapshot??'—'}</td><td>{r.sourceSnapshot??'—'}</td><td>{fmt(r.chemistry.cao)}</td><td>{fmt(r.quality.lsf)}</td><td>{fmt(r.quality.sm)}</td><td>{fmt(r.quality.am)}</td><td>{fmt(r.quality.naeq)}</td><td>{r.loaderUnitNo??'—'}</td><td>{r.block??'—'}</td></tr>):<tr><td colSpan={12} className="table-empty">Belum ada sample pada filter ini.</td></tr>}</tbody></table></div></div>
    {open&&<Modal title="Tambah Raw Sample" subtitle="Field mengikuti 10_DB_LIMESTONE / 11_DB_CLAY legacy." onClose={()=>setOpen(false)} footer={<div className="raw-sample-modal-footer"><div className="raw-sample-quality-preview" aria-live="polite">{([['LSF',quality.lsf],['SM',quality.sm],['AM',quality.am],['NaEq',quality.naeq]] as const).map(([label,value])=><span key={label}><small>{label}</small><strong>{fmt(value)}</strong></span>)}</div><div className="raw-sample-modal-actions"><button className="btn" type="button" onClick={()=>setOpen(false)}>Batal</button><button className="btn primary" type="button" disabled={mutation.isPending||!form.sampleId||!form.operationDate} onClick={()=>mutation.mutate()}>{mutation.isPending?'Menyimpan...':'Simpan Sample'}</button></div></div>}>
      <div className="form-grid"><label><span>Sample ID</span><input value={form.sampleId} onChange={e=>setForm(f=>({...f,sampleId:e.target.value}))}/></label><label><span>Tanggal</span><input type="date" value={form.operationDate} onChange={e=>setForm(f=>({...f,operationDate:e.target.value}))}/></label><label><span>No Sample</span><input value={form.noSample} onChange={e=>setForm(f=>({...f,noSample:e.target.value}))}/></label><label><span>Jam / Shift</span><input type="time" step="60" value={form.sourceShift} onChange={e=>setForm(f=>({...f,sourceShift:e.target.value}))}/></label><label><span>Grade / Type</span><input value={form.typeGrade} onChange={e=>setForm(f=>({...f,typeGrade:e.target.value}))}/></label><label><span>Vendor</span><select value={form.vendorId} onChange={e=>setVendor(e.target.value)}><option value="">— optional —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label><label><span>Source</span><input list="raw-source-options" value={form.sourceText} placeholder="Pilih atau ketik manual" onChange={e=>setSource(e.target.value)}/><datalist id="raw-source-options">{sourceOptions.map(x=><option key={`${x.value}-${x.label}`} value={x.value}>{x.label}</option>)}</datalist></label><label><span>No Alat Muat</span><input list="raw-loader-options" value={form.loaderUnitNo} placeholder="Pilih atau ketik manual" onChange={e=>setForm(f=>({...f,loaderUnitNo:e.target.value}))}/><datalist id="raw-loader-options">{loaderOptions.map(value=><option key={value} value={value}/>)}</datalist></label><label><span>Blok</span><input list="raw-block-options" value={form.block} placeholder="Pilih atau ketik manual" onChange={e=>setForm(f=>({...f,block:e.target.value}))}/><datalist id="raw-block-options">{blockOptions.map(value=><option key={value} value={value}/>)}</datalist></label><label><span>Arah</span><input list="raw-direction-options" value={form.direction} placeholder="Pilih atau ketik manual" onChange={e=>setForm(f=>({...f,direction:e.target.value}))}/><datalist id="raw-direction-options">{directionOptions.map(value=><option key={value} value={value}/>)}</datalist></label><div className="span-2 oxide-mini-grid">{oxideKeys.map(k=><label key={k}><span>{k.toUpperCase()}</span><input type="number" min="0" max="100" step="0.0001" value={form.chemistry[k]??''} onChange={e=>setChem(k,e.target.value)}/></label>)}</div><label className="span-2"><span>Keterangan</span><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></label></div>
      {mutation.isError&&<div className="alert error modal-alert">{mutation.error.message}</div>}
    </Modal>}
  </section>
}
