import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import type { Chemistry } from '@qc/contracts';
import { Modal } from '../../components/modal';
import { equipmentLookupQueryOptions } from '../../features/master/master-api';
import { createSample, listSamples, nextSampleNumber, qualityOf, type RawSampleView } from '../../features/qc/qc-api';
import { MaterialBadge, useMaterial, useMaterialLookups } from '../../features/navigation/material-context';
import { useDraftGuard } from '../../features/navigation/use-draft-guard';
import { materialNames } from '../../features/navigation/workflow';
import { BUSINESS_TIMEZONE, businessDateToday } from '../../lib/business-date';

export const Route=createFileRoute('/_authenticated/raw-samples')({component:RawSamplesPage});
const emptyChem:Chemistry={sio2:null,al2o3:null,fe2o3:null,cao:null,mgo:null,k2o:null,na2o:null,so3:null,h2o:null};
const today=businessDateToday;
const fmt=(v:number|null,d=2)=>v===null||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{maximumFractionDigits:d});
const oxideKeys=['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;

function businessTimeNow(date=new Date()):string {
  return new Intl.DateTimeFormat('en-GB',{timeZone:BUSINESS_TIMEZONE,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
}

function generatedSampleId(operationDate:string,kind:'LS'|'CL',time:string):string {
  const [year,month,day]=operationDate.split('-');
  return `${day??''}${month??''}${year?.slice(-2)??''}_${kind}_${time}`;
}

interface RawSampleForm {
  sampleId:string;operationDate:string;sourceShift:string;typeGrade:string;vendorId:string;sourceId:string;sourceText:string;
  loaderUnitNo:string;block:string;note:string;chemistry:Chemistry;
}

function blankForm(operationDate:string,kind:'LS'|'CL',sourceShift=businessTimeNow()):RawSampleForm {
  return {sampleId:generatedSampleId(operationDate,kind,sourceShift),operationDate,sourceShift,typeGrade:'',vendorId:'',sourceId:'',sourceText:'',loaderUnitNo:'',block:'',note:'',chemistry:{...emptyChem}};
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
  const qc=useQueryClient();const kind=useMaterial();const [date,setDate]=useState(today());const [search,setSearch]=useState('');const [open,setOpen]=useState(false);
  const [form,setForm]=useState<RawSampleForm>(()=>blankForm(today(),kind));
  const lookups=useMaterialLookups();
  const samples=useQuery({queryKey:['samples',kind,date,search],queryFn:()=>listSamples({materialKind:kind,operationDate:date,search,limit:500,offset:0})});
  const sampleNumber=useQuery({queryKey:['next-sample-number'],queryFn:nextSampleNumber,enabled:open,staleTime:0});
  const vendorSamples=useQuery({queryKey:['sample-field-options',kind,form.vendorId],queryFn:()=>listSamples({materialKind:kind,vendorId:form.vendorId,limit:500,offset:0}),enabled:open&&!!form.vendorId,staleTime:60_000});
  const equipment=useQuery({...equipmentLookupQueryOptions(form.vendorId||undefined,'AM',kind),enabled:open&&!!form.vendorId});
  const mutation=useMutation({mutationFn:()=>{
    const {sourceText,...sample}=form;
    return createSample({...sample,materialKind:kind,vendorId:form.vendorId||null,sourceId:form.sourceId||null,sourceSnapshot:form.sourceId?null:sourceText.trim()||null,noSample:null,sourceShift:form.sourceShift||null,typeGrade:form.typeGrade||null,loaderUnitNo:form.loaderUnitNo||null,block:form.block||null,note:form.note||null});
  },onSuccess:async()=>{setOpen(false);await Promise.all([qc.invalidateQueries({queryKey:['samples']}),qc.invalidateQueries({queryKey:['next-sample-number']}),qc.invalidateQueries({queryKey:['sample-field-options']}),qc.invalidateQueries({queryKey:['workspace-stats',kind]})]);}});
  const vendors=lookups.data?.vendors??[];const sources=(lookups.data?.sources??[]).filter(x=>x.materialKind===kind);
  const rows=samples.data?.items??[];const history=vendorSamples.data?.items??[];
  useDraftGuard(open&&(mutation.isPending||JSON.stringify(form)!==JSON.stringify(blankForm(date,kind,form.sourceShift))));
  const quality=useMemo(()=>qualityOf(form.chemistry),[form.chemistry]);
  const loaderOptions=useMemo(()=>uniqueStrings([...(equipment.data?.items??[]).map(x=>x.unitNo),...history.map(x=>x.loaderUnitNo)]),[equipment.data?.items,history]);
  const blockOptions=useMemo(()=>uniqueStrings([...sources.map(x=>x.block),...history.map(x=>x.block)]),[sources,history]);
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
  const setVendor=(vendorId:string)=>setForm(f=>({...f,vendorId,sourceId:'',sourceText:'',loaderUnitNo:'',block:''}));
  const setOperationDate=(operationDate:string)=>setForm(f=>({...f,operationDate,sampleId:generatedSampleId(operationDate,kind,f.sourceShift)}));
  const setSampleTime=(sourceShift:string)=>setForm(f=>({...f,sourceShift,sampleId:generatedSampleId(f.operationDate,kind,sourceShift)}));
  const setSource=(sourceText:string)=>{
    const normalized=sourceText.trim().toLocaleLowerCase('id-ID');
    const selected=sources.find(source=>source.label.toLocaleLowerCase('id-ID')===normalized||source.code.toLocaleLowerCase('id-ID')===normalized);
    setForm(f=>({...f,sourceText,sourceId:selected?.id??'',block:selected?.block??f.block}));
  };
  return <section className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{materialNames[kind]} / LABORATORIUM</p><h1>Sampel Laboratorium</h1><p>Kelola sampel {materialNames[kind]} dan hasil analisis kimia untuk memastikan mutu bahan baku.</p></div><button className="btn primary" type="button" onClick={()=>{setForm(blankForm(date,kind));setOpen(true)}}>+ Sample</button></div>
    <div className="card toolbar-card"><MaterialBadge /><input aria-label="Tanggal sampel" type="date" value={date} onChange={e=>setDate(e.target.value)}/><input aria-label="Cari sampel" placeholder="Cari Sample ID / vendor / source..." value={search} onChange={e=>setSearch(e.target.value)}/><span className="toolbar-meta">{samples.data?.total??0} sample</span></div>
    {(samples.isError||lookups.isError)&&<div className="alert error" role="alert">{samples.error?.message??lookups.error?.message}</div>}
    <div className="card table-card"><div className="table-shell"><table className="native-table qc-wide"><thead><tr><th>Sample ID</th><th>No Sample</th><th>Type/Grade</th><th>Vendor</th><th>Source</th><th>CaO</th><th>LSF</th><th>SM</th><th>AM</th><th>NaEq</th><th>Loader</th><th>Block</th></tr></thead><tbody>{rows.length?rows.map((r:RawSampleView)=><tr key={r.id}><td><strong>{r.sampleId}</strong><small className="table-sub">{r.operationDate}</small></td><td>{r.noSample??'—'}</td><td>{r.typeGrade??'—'}</td><td>{r.vendorSnapshot??'—'}</td><td>{r.sourceSnapshot??'—'}</td><td>{fmt(r.chemistry.cao)}</td><td>{fmt(r.quality.lsf)}</td><td>{fmt(r.quality.sm)}</td><td>{fmt(r.quality.am)}</td><td>{fmt(r.quality.naeq)}</td><td>{r.loaderUnitNo??'—'}</td><td>{r.block??'—'}</td></tr>):<tr><td colSpan={12} className="table-empty">{samples.isLoading?'Memuat sampel…':samples.isError?'Data sampel tidak dapat dimuat.':'Belum ada sampel pada tanggal ini. Tambahkan sampel untuk mulai bekerja.'}</td></tr>}</tbody></table></div></div>
    {open&&<Modal title="Tambah Raw Sample" subtitle={`Sampel baru untuk workspace ${materialNames[kind]}. Nilai mutu dihitung otomatis.`} onClose={()=>setOpen(false)} footer={<div className="raw-sample-modal-footer"><div className="raw-sample-quality-preview" aria-live="polite">{([['LSF',quality.lsf],['SM',quality.sm],['AM',quality.am],['NaEq',quality.naeq]] as const).map(([label,value])=><span key={label}><small>{label}</small><strong>{fmt(value)}</strong></span>)}</div><div className="raw-sample-modal-actions"><button className="btn" type="button" onClick={()=>setOpen(false)}>Batal</button><button className="btn primary" type="button" disabled={mutation.isPending||sampleNumber.isPending||sampleNumber.isError||sampleNumber.data?.nextNumber===undefined||!form.sampleId||!form.operationDate} onClick={()=>mutation.mutate()}>{mutation.isPending?'Menyimpan...':'Simpan Sample'}</button></div></div>}>
      <div className="raw-sample-form-layout">
        <section className="raw-sample-form-card">
          <div className="raw-sample-form-card-heading"><strong>Identitas Sampel</strong><small>Informasi dibuat otomatis saat form dibuka.</small></div>
          <div className="form-grid">
            <label><span>Tanggal</span><input autoFocus type="date" value={form.operationDate} onChange={e=>setOperationDate(e.target.value)}/></label>
            <label><span>Jam Sampel</span><input type="time" step="60" value={form.sourceShift} onChange={e=>setSampleTime(e.target.value)}/></label>
            <label><span>Sample ID</span><input className="mono-input" value={form.sampleId} readOnly aria-readonly="true"/></label>
            <label><span>No Sample</span><input className="mono-input" value={sampleNumber.data?.nextNumber??''} placeholder={sampleNumber.isPending?'Memuat nomor...':'—'} readOnly aria-readonly="true"/></label>
            <label className="span-2"><span>Grade / Type <small className="field-optional">(opsional)</small></span><input value={form.typeGrade} placeholder="Boleh dikosongkan" onChange={e=>setForm(f=>({...f,typeGrade:e.target.value}))}/></label>
          </div>
        </section>
        <section className="raw-sample-form-card">
          <div className="raw-sample-form-card-heading"><strong>Vendor &amp; Source</strong><small>Asal material untuk sample ini.</small></div>
          <div className="form-grid">
            <label><span>Vendor</span><select value={form.vendorId} onChange={e=>setVendor(e.target.value)}><option value="">— opsional —</option>{vendors.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
            <label><span>Source</span><input list="raw-source-options" value={form.sourceText} placeholder="Pilih atau ketik manual" onChange={e=>setSource(e.target.value)}/><datalist id="raw-source-options">{sourceOptions.map(x=><option key={`${x.value}-${x.label}`} value={x.value}>{x.label}</option>)}</datalist></label>
          </div>
        </section>
        <section className="raw-sample-form-card raw-sample-form-card-wide">
          <div className="raw-sample-form-card-heading"><strong>Detail Pemuatan</strong><small>Lengkapi bila informasi tersedia.</small></div>
          <div className="form-grid">
            <label><span>No Alat Muat</span><input list="raw-loader-options" value={form.loaderUnitNo} placeholder="Pilih atau ketik manual" onChange={e=>setForm(f=>({...f,loaderUnitNo:e.target.value}))}/><datalist id="raw-loader-options">{loaderOptions.map(value=><option key={value} value={value}/>)}</datalist></label>
            <label><span>Blok</span><input list="raw-block-options" value={form.block} placeholder="Pilih atau ketik manual" onChange={e=>setForm(f=>({...f,block:e.target.value}))}/><datalist id="raw-block-options">{blockOptions.map(value=><option key={value} value={value}/>)}</datalist></label>
            <label className="span-2"><span>Keterangan</span><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/></label>
          </div>
        </section>
        <section className="raw-sample-form-card raw-sample-form-card-wide">
          <div className="raw-sample-form-card-heading"><strong>Hasil Analisis Kimia</strong><small>Isi nilai oksida bila hasil laboratorium sudah tersedia.</small></div>
          <div className="oxide-mini-grid">{oxideKeys.map(k=><label key={k}><span>{k.toUpperCase()}</span><input type="number" min="0" max="100" step="0.0001" value={form.chemistry[k]??''} onChange={e=>setChem(k,e.target.value)}/></label>)}</div>
        </section>
      </div>
      {sampleNumber.isError&&<div className="alert error modal-alert">Nomor sample berikutnya tidak dapat dimuat. Silakan coba lagi.</div>}
      {mutation.isError&&<div className="alert error modal-alert">{mutation.error.message}</div>}
    </Modal>}
  </section>
}
