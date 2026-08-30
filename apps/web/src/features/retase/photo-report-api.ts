import type { CounterAssignment, CrusherReportDraft, CrusherReportImport, ShiftCode } from '@qc/contracts';
import { apiFetch,apiFetchBlob } from '../../lib/api-client';
const base='/crusher-report-imports';
export const listPhotoReports=(crusherId:string)=>apiFetch<{items:CrusherReportImport[]}>(`${base}?${new URLSearchParams({crusherId})}`);
export const getPhotoReport=(id:string)=>apiFetch<{item:CrusherReportImport}>(`${base}/${id}`);
export const getPhotoReportImage=(id:string,aligned:boolean)=>apiFetchBlob(`${base}/${id}/image?aligned=${aligned}`);
export const deletePhotoReport=(id:string)=>apiFetch<{ok:true;deletedId:string}>(`${base}/${id}`,{method:'DELETE'});
export const getPhotoAssignments=(id:string,operationDate:string,shiftCode:ShiftCode)=>apiFetch<{items:CounterAssignment[]}>(`${base}/${id}/assignments?${new URLSearchParams({operationDate,shiftCode})}`);
export function uploadPhotoReport(crusherId:string,file:File){const form=new FormData();form.append('file',file);return apiFetch<{item:CrusherReportImport}>(`${base}?${new URLSearchParams({crusherId})}`,{method:'POST',body:form});}
export const savePhotoDraft=(id:string,revision:number,draft:CrusherReportDraft)=>apiFetch<{item:CrusherReportImport}>(`${base}/${id}/draft`,{method:'PATCH',body:JSON.stringify({revision,draft})});
export const confirmPhotoReport=(id:string,revision:number,draft?:CrusherReportDraft)=>apiFetch<{item:CrusherReportImport}>(`${base}/${id}/confirm`,{method:'POST',body:JSON.stringify({revision,reviewed:true,...(draft?{draft}:{})})});
export const reparsePhotoReport=(id:string)=>apiFetch<{item:CrusherReportImport}>(`${base}/${id}/reparse`,{method:'POST'});
