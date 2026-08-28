import type {
  CreateShiftReportRequest, CreateShiftReportRevisionRequest, MaterialKind, ShiftCode, ShiftReport, ShiftReportStatus, UpdateShiftReportDraftRequest,
} from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export interface ShiftReportResponse { ok:true; item:ShiftReport|null }
export interface ShiftReportListResponse { ok:true; items:ShiftReport[]; total:number }
export interface EquipmentLookupItem { id:string; code:string; label:string; active:boolean; vendorId:string; type:'AM'|'AA'; unitNo:string; aliases?:string[] }

function qs(input:Record<string,string|number|undefined>){
  const s=new URLSearchParams();
  Object.entries(input).forEach(([k,v])=>{if(v!==undefined&&v!=='')s.set(k,String(v))});
  return s.toString();
}

export function getCurrentShiftReport(input:{operationDate:string;shiftCode:ShiftCode;materialKind:MaterialKind;vendorId?:string}){
  return apiFetch<ShiftReportResponse>(`/vendor/shift-reports/current?${qs(input)}`);
}
export function listShiftReports(input:{vendorId?:string;operationDate?:string;shiftCode?:ShiftCode;materialKind?:MaterialKind;status?:ShiftReportStatus;limit?:number;offset?:number}={}){
  return apiFetch<ShiftReportListResponse>(`/vendor/shift-reports?${qs({...input,limit:input.limit??50,offset:input.offset??0})}`);
}
export function getShiftReport(id:string){return apiFetch<{ok:true;item:ShiftReport}>(`/vendor/shift-reports/${id}`)}
export function createShiftReport(body:CreateShiftReportRequest){return apiFetch<{ok:true;item:ShiftReport}>('/vendor/shift-reports',{method:'POST',body:JSON.stringify(body)})}
export function updateShiftReportDraft(id:string,body:UpdateShiftReportDraftRequest){return apiFetch<{ok:true;item:ShiftReport}>(`/vendor/shift-reports/${id}/draft`,{method:'PUT',body:JSON.stringify(body)})}
export function submitShiftReport(id:string,reason?:string){return apiFetch<{ok:true;item:ShiftReport}>(`/vendor/shift-reports/${id}/submit`,{method:'POST',body:JSON.stringify({reason:reason||null})})}
export function createShiftReportRevision(id:string,body:CreateShiftReportRevisionRequest){return apiFetch<{ok:true;item:ShiftReport}>(`/vendor/shift-reports/${id}/revisions`,{method:'POST',body:JSON.stringify(body)})}
export function equipmentLookup(vendorId:string,type:'AM'|'AA',materialKind?:MaterialKind){return apiFetch<{ok:true;items:EquipmentLookupItem[]}>(`/lookups/equipment?${qs({vendorId,type,materialKind})}`)}
