import type { ClayRetaseUse, ClayWorkbenchSource } from '@qc/contracts';

export function claySourceLabel(source:ClayWorkbenchSource){
  return [source.headerPrimary,source.headerSecondary].filter(Boolean).join(' / ');
}
export function remainingClayRetase(source:ClayWorkbenchSource,owned:ClayRetaseUse[],draft:ClayRetaseUse[]){
  const sum=(items:ClayRetaseUse[])=>items.filter(x=>x.columnId===source.columnId).reduce((s,x)=>s+x.retase,0);
  return Math.max(0,source.availableRetase+sum(owned)-sum(draft));
}

export function ClayRetasePicker({sampleId,sources,value,owned,draft,onChange,disabled=false}:{
  sampleId:string;sources:ClayWorkbenchSource[];value:ClayRetaseUse[];owned:ClayRetaseUse[];draft:ClayRetaseUse[];
  onChange:(value:ClayRetaseUse[])=>void;disabled?:boolean;
}){
  return <div className="clay-retase-picker">
    {value.map(use=>{const source=sources.find(x=>x.columnId===use.columnId);const label=source?claySourceLabel(source):'Kolom laporan tidak tersedia';
      return <div className="inline-actions" key={use.columnId}>
        <span title={source?.crusherName}>{label}</span>
        <input className="grid-number" aria-label={`Retase ${sampleId} ${label}`} type="number" min="1" step="1" disabled={disabled}
          max={source?remainingClayRetase(source,owned,draft)+use.retase:use.retase} value={use.retase}
          onChange={e=>onChange(value.map(x=>x.columnId===use.columnId?{...x,retase:Math.max(0,Math.trunc(Number(e.target.value)||0))}:x))}/>
        <button className="btn small" aria-label={`Hapus sumber ${sampleId} ${label}`} disabled={disabled} onClick={()=>onChange(value.filter(x=>x.columnId!==use.columnId))}>×</button>
      </div>;
    })}
    <select aria-label={`Sumber retase ${sampleId}`} value="" disabled={disabled} onChange={e=>{
      const source=sources.find(x=>x.columnId===e.target.value);if(source)onChange([...value,{columnId:source.columnId,retase:remainingClayRetase(source,owned,draft)}]);
    }}><option value="">+ Pilih kolom laporan crusher</option>{sources.filter(x=>!value.some(v=>v.columnId===x.columnId)).map(source=>{
      const available=remainingClayRetase(source,owned,draft);
      return <option key={source.columnId} value={source.columnId} disabled={source.columnStatus!=='CONFIRMED'||available<=0}>
        {claySourceLabel(source)} · {source.crusherName} · sisa {available}{source.columnStatus!=='CONFIRMED'?` · ${source.columnStatus}`:''}
      </option>;
    })}</select>
  </div>;
}
