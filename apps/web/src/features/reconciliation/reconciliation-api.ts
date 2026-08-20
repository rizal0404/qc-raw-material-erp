import type {
  ConfirmRetaseAllocationRequest, CreateRetaseAllocationRequest, MappingStatus, MaterialKind, ReconciliationAllocation,
  ReconciliationAssignment, ReconciliationCandidate, ReconciliationException, ReconciliationExceptionAssignmentCandidate, ResolveReconciliationExceptionRequest, ShiftCode, UpdateRetaseAllocationRequest, WorkbenchRetaseSuggestion,
} from '@qc/contracts';
import { apiFetch } from '../../lib/api-client';

export interface ReconciliationSummary {assignmentCount:number;observedRetase:number;reservedRetase:number;remainingRetase:number;reviewRequired:number;unassignedEvents:number;ambiguousEvents:number;}
export interface ReconciliationResponse {ok:true;items:ReconciliationAssignment[];exceptions:ReconciliationException[];summary:ReconciliationSummary;}
function qs(params:Record<string,string|undefined>){const q=new URLSearchParams();Object.entries(params).forEach(([k,v])=>{if(v)q.set(k,v)});return q.toString();}
export function getReconciliation(params:{operationDate:string;shiftCode?:ShiftCode;crusherId?:string;vendorId?:string;materialKind?:MaterialKind;mappingStatus?:MappingStatus;search?:string}){return apiFetch<ReconciliationResponse>(`/reconciliation?${qs(params)}`);}
export function getReconciliationCandidates(assignmentId:string){return apiFetch<{ok:true;items:ReconciliationCandidate[]}>(`/reconciliation/${assignmentId}/candidates`);}
export function getReconciliationEvents(assignmentId:string){return apiFetch<{ok:true;items:Array<{id:string;eventTs:string;aaUnitNo:string|null;delta:number;eventType:string;status:string;createdByName:string;reason:string|null}>}>(`/reconciliation/${assignmentId}/events`);}
export function getExceptionAssignmentCandidates(eventId:string){return apiFetch<{ok:true;items:ReconciliationExceptionAssignmentCandidate[]}>(`/reconciliation/exceptions/${eventId}/assignment-candidates`);}
export function resolveReconciliationException(eventId:string,body:ResolveReconciliationExceptionRequest){return apiFetch<{ok:true;item:{eventId:string;assignmentId:string;status:'VALID'}}>(`/reconciliation/exceptions/${eventId}/resolve`,{method:'POST',body:JSON.stringify(body)});}
export function createRetaseAllocation(body:CreateRetaseAllocationRequest){return apiFetch<{ok:true;item:ReconciliationAllocation}>('/reconciliation/allocations',{method:'POST',body:JSON.stringify(body)});}
export function updateRetaseAllocation(id:string,body:UpdateRetaseAllocationRequest){return apiFetch<{ok:true;item:ReconciliationAllocation}>(`/reconciliation/allocations/${id}`,{method:'PATCH',body:JSON.stringify(body)});}
export function confirmRetaseAllocation(id:string,body:ConfirmRetaseAllocationRequest){return apiFetch<{ok:true;item:ReconciliationAllocation}>(`/reconciliation/allocations/${id}/confirm`,{method:'POST',body:JSON.stringify(body)});}
export function getWorkbenchRetaseSuggestions(materialKind:MaterialKind,operationDate:string){return apiFetch<{ok:true;items:WorkbenchRetaseSuggestion[]}>(`/workbench/retase-suggestions?materialKind=${materialKind}&operationDate=${operationDate}`);}
