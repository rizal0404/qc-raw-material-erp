import type { CounterAssignment, CounterContextResponse, OperationalAssignmentInput, RecordRetaseEventRequest, RetaseEvent, RetaseSummary, ReverseRetaseEventRequest, ShiftCode, UpdateOperationalAssignmentRequest } from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

function qs(input:Record<string,string|number|undefined>){const q=new URLSearchParams();Object.entries(input).forEach(([k,v])=>{if(v!==undefined&&v!=='')q.set(k,String(v))});return q.toString();}

export function getCounterContext(input:{crusherId:string;operationDate?:string;shiftCode?:ShiftCode}){
  return apiFetch<CounterContextResponse>(`/counter/context?${qs(input)}`);
}
export function getCounterAssignments(input:{crusherId:string;operationDate:string;shiftCode:ShiftCode}){
  return apiFetch<{ok:true;items:CounterAssignment[];total:number}>(`/counter/assignments?${qs(input)}`);
}
export function recordRetase(body:RecordRetaseEventRequest){
  return apiFetch<{ok:true;item:RetaseEvent;idempotent?:boolean}>('/retase-events',{method:'POST',body:JSON.stringify(body)});
}
export function reverseRetase(id:string,body:ReverseRetaseEventRequest){
  return apiFetch<{ok:true;item:RetaseEvent;idempotent?:boolean}>(`/retase-events/${id}/reverse`,{method:'POST',body:JSON.stringify(body)});
}
export function listRetaseEvents(input:{crusherId:string;operationDate:string;shiftCode:ShiftCode;limit?:number;offset?:number}){
  return apiFetch<{ok:true;items:RetaseEvent[];total:number}>(`/retase-events?${qs({...input,limit:input.limit??30,offset:input.offset??0})}`);
}
export function getRetaseSummary(input:{crusherId:string;operationDate:string;shiftCode:ShiftCode}){
  return apiFetch<{ok:true;summary:RetaseSummary}>(`/retase-summary?${qs(input)}`);
}
export function listOperationalAssignments(input:{operationDate:string;shiftCode:ShiftCode;vendorId?:string;crusherId?:string;status?:'ACTIVE'|'CLOSED'|'CANCELLED'}){return apiFetch<{ok:true;items:CounterAssignment[];total:number}>(`/operational-assignments?${qs(input)}`);}
export function createOperationalAssignment(body:OperationalAssignmentInput){return apiFetch<{ok:true;item:CounterAssignment}>('/operational-assignments',{method:'POST',body:JSON.stringify(body)});}
export function updateOperationalAssignment(id:string,body:UpdateOperationalAssignmentRequest){return apiFetch<{ok:true;item:CounterAssignment}>(`/operational-assignments/${id}`,{method:'PUT',body:JSON.stringify(body)});}
export function cancelOperationalAssignment(id:string,reason:string){return apiFetch<{ok:true;item:CounterAssignment}>(`/operational-assignments/${id}/cancel`,{method:'POST',body:JSON.stringify({reason})});}
