import type { Chemistry, MaterialKind, MasterLookupResponse, Quality, SaveMixRequest, ClayWorkbenchSource, ClayRetaseUse } from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export interface RawSampleView {
  id:string;sampleId:string;materialKind:MaterialKind;operationDate:string;noSample:string|null;sourceShift:string|null;typeGrade:string|null;
  vendorId:string|null;vendorSnapshot:string|null;sourceId:string|null;sourceSnapshot:string|null;plantId:string|null;loaderUnitNo:string|null;block:string|null;direction:string|null;
  chemistry:Chemistry;quality:Quality;note:string|null;createdAt:string;updatedAt:string;
}
export interface WorkbenchSample extends RawSampleView { defaultTonPerRetase:number;mappedRetase:number|null;retaseSource:string; }
export interface MixItemView {id:string;rawSampleId:string;sampleId:string;noSample:string|null;typeGrade:string|null;vendorSnapshot:string|null;sourceSnapshot:string|null;retase:number;tonPerRetase:number;tonnage:number;chemistry:Chemistry;quality:Quality;note:string|null;hasChemistryRevision:boolean;retaseAllocationIds:string[];mappedRetaseConsumed:number;clayRetaseSources:ClayRetaseUse[];}
export interface MixView {id:string;mixCode:string;materialKind:MaterialKind;operationDate:string;pileId:string;pileCode:string;pileName:string;plantId:string|null;plantCode:string|null;plantName:string|null;className:string|null;shiftCode:string;batchNo:number|null;tiangKe:string|null;pileCycle:number;defaultTonPerRetase:number;status:string;replacesMixId:string|null;note:string|null;createdAt:string;updatedAt:string;items:MixItemView[];}
export interface MixListItem extends Omit<MixView,'items'> {}

export function masterLookups(){return apiFetch<MasterLookupResponse>('/lookups/master');}
export function masterLookupsFor(materialKind:MaterialKind){return apiFetch<MasterLookupResponse>(`/lookups/master?materialKind=${materialKind}`);}
export function listSamples(params:Record<string,string|number|undefined>){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v));});return apiFetch<{ok:true;items:RawSampleView[];total:number}>(`/samples?${q}`);}
export function nextSampleNumber(){return apiFetch<{ok:true;nextNumber:number}>('/samples/next-number');}
export function getWorkbenchSamples(materialKind:MaterialKind,operationDate:string){return apiFetch<{ok:true;items:WorkbenchSample[]}>(`/workbench/samples?materialKind=${materialKind}&operationDate=${operationDate}`);}
export function getClayWorkbenchSources(operationDate:string,shiftCode:string){return apiFetch<{ok:true;items:ClayWorkbenchSource[]}>(`/workbench/clay-retase?operationDate=${operationDate}&shiftCode=${shiftCode}`);}
export function listMixes(params:Record<string,string|number|undefined>){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v));});return apiFetch<{ok:true;items:MixListItem[];total:number}>(`/mixes?${q}`);}
export function getMix(mixCode:string){return apiFetch<{ok:true;item:MixView}>(`/mixes/${encodeURIComponent(mixCode)}`);}
export function saveMix(body:SaveMixRequest){return apiFetch<{ok:true;item:MixView}>('/mixes',{method:'POST',body:JSON.stringify(body)});}
export function replaceMix(mixCode:string,body:SaveMixRequest&{reason:string}){return apiFetch<{ok:true;item:MixView}>(`/mixes/${encodeURIComponent(mixCode)}/replace`,{method:'POST',body:JSON.stringify(body)});}
export function chemistryHistory(itemId:string){return apiFetch<{ok:true;items:Array<{revisionNo:number;before:Chemistry;after:Chemistry;reason:string;changedBy:string;changedByName:string;changedAt:string}>}>(`/mix-items/${itemId}/chemistry-revisions`);}
export function reviseChemistry(itemId:string,chemistry:Chemistry,reason:string){return apiFetch<{ok:true;item:MixView}>(`/mix-items/${itemId}/chemistry-revisions`,{method:'POST',body:JSON.stringify({chemistry,reason})});}
export function createSample(body:unknown){return apiFetch<{ok:true;item:RawSampleView}>('/samples',{method:'POST',body:JSON.stringify(body)});}
export function updateSample(id:string,body:unknown){return apiFetch<{ok:true;item:RawSampleView}>(`/samples/${id}`,{method:'PATCH',body:JSON.stringify(body)});}
export function mixSummary(params:Record<string,string|undefined>){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v)q.set(k,v);});return apiFetch<{ok:true;items:any[]}>(`/reports/mix-summary?${q}`);}
export function pileCumulative(params:Record<string,string|undefined>){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v)q.set(k,v);});return apiFetch<{ok:true;items:any[]}>(`/reports/pile-cumulative?${q}`);}
export function qafReport(materialKind:MaterialKind,month:string,plantId:string){return apiFetch<{ok:true;items:any[]}>(`/reports/qaf?materialKind=${materialKind}&month=${month}&plantId=${plantId}`);}

export function qualityOf(c:Chemistry):Quality{
  const safe=(a:number|null,b:number|null)=>a===null||b===null||!Number.isFinite(a)||!Number.isFinite(b)||b===0?null:a/b;
  const den=c.sio2!==null&&c.al2o3!==null&&c.fe2o3!==null?2.8*c.sio2+1.18*c.al2o3+.65*c.fe2o3:null;
  return{lsf:safe(c.cao===null?null:100*c.cao,den),sm:safe(c.sio2,c.al2o3!==null&&c.fe2o3!==null?c.al2o3+c.fe2o3:null),am:safe(c.al2o3,c.fe2o3),naeq:c.na2o!==null&&c.k2o!==null?c.na2o+.658*c.k2o:null,r2o3:c.sio2!==null&&c.al2o3!==null&&c.fe2o3!==null?c.sio2+c.al2o3+c.fe2o3:null};
}
