import type {
  AuthPrincipal, ReconciliationAssignmentRecord, ReconciliationRepository, RetaseAllocationRecord,
} from '@qc/domain';
import type {
  ConfirmRetaseAllocationRequest, CreateRetaseAllocationRequest, MappingStatus, ReconciliationListQuery,
  UpdateRetaseAllocationRequest, WorkbenchRetaseSuggestion,
} from '@qc/contracts';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors';

const iso=(d:Date|null)=>d?d.toISOString():null;
function assertQc(p:AuthPrincipal){if(!['QC_ANALYST','SUPERVISOR_ADMIN'].includes(p.role))throw forbidden();}
function assertLimestone(kind:string){if(kind==='CL')throw new AppError(409,'CLAY_DIRECT_WORKFLOW','Clay langsung dari laporan crusher dan sampel laboratorium ke Mixing Workbench; tidak memakai rekonsiliasi retase.');}
function allocationDto(a:RetaseAllocationRecord){return {...a,confirmedAt:iso(a.confirmedAt),consumedAt:iso(a.consumedAt),createdAt:a.createdAt.toISOString(),updatedAt:a.updatedAt.toISOString()};}
function derivedStatus(a:ReconciliationAssignmentRecord,candidateCount:number):MappingStatus{
  if(a.reviewRequired||a.allocations.some(x=>x.reviewRequired||x.mappingStatus==='REVIEW_REQUIRED'))return 'REVIEW_REQUIRED';
  if(a.remainingRetase===0&&a.allocations.some(x=>x.mappingStatus==='CONSUMED'))return 'CONSUMED';
  if(a.allocations.some(x=>x.mappingStatus==='CONFIRMED'))return 'CONFIRMED';
  if(candidateCount===0)return 'UNMAPPED';
  if(candidateCount===1)return 'SUGGESTED';
  return 'AMBIGUOUS';
}
function exceptionOf(a:ReconciliationAssignmentRecord,status:MappingStatus,candidates:number):string|null{
  if(!['SUBMITTED','OPERATIONAL'].includes(a.reportStatus))return 'Upstream assignment sudah tidak aktif/effective.';
  if(a.observedRetase===0)return 'Assigned AA belum memiliki DUMP valid.';
  if(a.assignedAaCount>a.aaWithDumpCount)return `${a.assignedAaCount-a.aaWithDumpCount} assigned AA belum pernah dump.`;
  if(a.remainingRetase<0)return `Reserved/consumed retase melebihi observed sebesar ${Math.abs(a.remainingRetase)}.`;
  if(status==='UNMAPPED')return 'Tidak ada Sample_ID candidate berdasarkan field Vendor.';
  if(status==='AMBIGUOUS'||candidates>1)return `${candidates} Sample_ID candidate berdasarkan field Vendor.`;
  if(status==='REVIEW_REQUIRED')return a.allocations.find(x=>x.reviewReason)?.reviewReason??'Mapping perlu review.';
  return null;
}

export function createReconciliationService(repository:ReconciliationRepository){
  async function assignmentWithCandidates(a:ReconciliationAssignmentRecord){
    const candidates=await repository.listCandidates(a.assignmentId);const status=derivedStatus(a,candidates.length);const suggested=candidates.length===1?candidates[0]!:null;
    return {...a,candidateCount:candidates.length,suggestedSampleId:suggested?.id??null,suggestedSampleCode:suggested?.sampleId??null,mappingStatus:status,reviewRequired:a.reviewRequired||a.allocations.some(x=>x.reviewRequired),exception:exceptionOf(a,status,candidates.length),allocations:a.allocations.map(allocationDto)};
  }

  return {
    async list(principal:AuthPrincipal,query:ReconciliationListQuery){
      assertQc(principal);assertLimestone(query.materialKind??'LS');query={...query,materialKind:'LS'};await repository.markReviewRequiredForDrift(query.operationDate);
      const base=await repository.listAssignments(query);const items=[];for(const a of base){const x=await assignmentWithCandidates(a);if(!query.mappingStatus||x.mappingStatus===query.mappingStatus)items.push(x);}
      const exceptions=await repository.listExceptions(query);return {items,exceptions,summary:{assignmentCount:items.length,observedRetase:items.reduce((s,x)=>s+x.observedRetase,0),reservedRetase:items.reduce((s,x)=>s+x.reservedRetase,0),remainingRetase:items.reduce((s,x)=>s+Math.max(0,x.remainingRetase),0),reviewRequired:items.filter(x=>x.reviewRequired).length,unassignedEvents:exceptions.filter(x=>x.status==='EXCEPTION_UNASSIGNED').length,ambiguousEvents:exceptions.filter(x=>x.status==='AMBIGUOUS').length}};
    },
    async exceptionAssignmentCandidates(principal:AuthPrincipal,eventId:string){assertQc(principal);return repository.listExceptionAssignmentCandidates(eventId);},
    async resolveException(principal:AuthPrincipal,eventId:string,input:{assignmentId:string;reason:string},requestId?:string){
      assertQc(principal);const candidates=await repository.listExceptionAssignmentCandidates(eventId);if(!candidates.some(x=>x.assignmentId===input.assignmentId))throw new AppError(400,'ASSIGNMENT_NOT_CANDIDATE','Assignment tidak valid untuk exception event ini.');
      try{await repository.resolveExceptionEvent({eventId,assignmentId:input.assignmentId,reason:input.reason.trim(),actorUserId:principal.userId,actorRoleSnapshot:principal.role,requestId});return {eventId,assignmentId:input.assignmentId,status:'VALID' as const};}
      catch(e){const m=(e as Error).message;if(m.includes('bukan exception'))throw conflict('EVENT_NOT_RECONCILABLE',m);if(m.includes('effective SUBMITTED'))throw conflict('UPSTREAM_REPORT_NOT_EFFECTIVE',m);if(m.includes('tidak sesuai'))throw conflict('ASSIGNMENT_CONTEXT_MISMATCH',m);if(m.includes('terikat'))throw conflict('RETASE_EVENT_ALREADY_ALLOCATED',m);throw e;}
    },
    async candidates(principal:AuthPrincipal,assignmentId:string){assertQc(principal);const a=await repository.getAssignment(assignmentId);if(!a)throw notFound('Loading assignment tidak ditemukan.');return repository.listCandidates(assignmentId);},
    async events(principal:AuthPrincipal,assignmentId:string){assertQc(principal);const a=await repository.getAssignment(assignmentId);if(!a)throw notFound('Loading assignment tidak ditemukan.');return (await repository.listAssignmentEvents(assignmentId)).map(x=>({...x,eventTs:x.eventTs.toISOString()}));},
    async createAllocation(principal:AuthPrincipal,input:CreateRetaseAllocationRequest,requestId?:string){
      assertQc(principal);const a=await repository.getAssignment(input.assignmentId);if(!a)throw notFound('Loading assignment tidak ditemukan.');assertLimestone(a.materialKind);if(!['SUBMITTED','OPERATIONAL'].includes(a.reportStatus))throw conflict('UPSTREAM_REPORT_NOT_EFFECTIVE','Assignment upstream sudah tidak effective.');if(a.observedRetase<=0)throw conflict('NO_OBSERVED_RETASE','Belum ada DUMP valid untuk assignment ini.');
      const candidates=await repository.listCandidates(a.assignmentId);if(!candidates.some(c=>c.id===input.sampleId))throw new AppError(400,'SAMPLE_NOT_CANDIDATE','Sample_ID tidak termasuk candidate berdasarkan field Vendor.');
      if(input.approvedRetase&&input.approvedRetase>a.remainingRetase)throw conflict('RETASE_EXCEEDS_REMAINING',`Approved Retase melebihi remaining ${Math.max(0,a.remainingRetase)}.`);
      try{const created=await repository.createAllocation({assignmentId:a.assignmentId,sampleId:input.sampleId,observedRetase:a.observedRetase,approvedRetase:input.approvedRetase??null,candidateCount:candidates.length,note:input.note??null,createdBy:principal.userId});await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'CREATE',entityType:'QC_RETASE_ALLOCATION',entityId:created.id,afterJson:{assignmentId:a.assignmentId,sampleId:input.sampleId,approvedRetase:input.approvedRetase??null},requestId});return allocationDto(created);}catch(e){if((e as {code?:string}).code==='23505')throw conflict('ALLOCATION_EXISTS','Allocation open untuk assignment + Sample_ID tersebut sudah ada.');throw e;}
    },
    async updateAllocation(principal:AuthPrincipal,id:string,input:UpdateRetaseAllocationRequest,requestId?:string){
      assertQc(principal);const current=await repository.getAllocation(id);if(!current)throw notFound('Retase allocation tidak ditemukan.');if(['CONSUMED','CONFIRMED'].includes(current.mappingStatus))throw conflict('ALLOCATION_LOCKED','Allocation CONFIRMED/CONSUMED tidak dapat diedit langsung. Review atau buat mapping baru.');
      const a=await repository.getAssignment(current.assignmentId);if(!a)throw notFound('Loading assignment tidak ditemukan.');assertLimestone(a.materialKind);const candidates=await repository.listCandidates(a.assignmentId);const sampleId=input.sampleId??current.sampleId;if(!sampleId||!candidates.some(c=>c.id===sampleId))throw new AppError(400,'SAMPLE_NOT_CANDIDATE','Sample_ID tidak termasuk candidate berdasarkan field Vendor.');
      if(input.approvedRetase&&input.approvedRetase>a.remainingRetase+(current.approvedRetase??0))throw conflict('RETASE_EXCEEDS_REMAINING','Approved Retase melebihi remaining assignment.');
      const updated=await repository.updateAllocation(id,{sampleId,approvedRetase:input.approvedRetase,candidateCount:candidates.length,note:input.note,updatedBy:principal.userId});if(!updated)throw notFound('Retase allocation tidak ditemukan.');await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'UPDATE',entityType:'QC_RETASE_ALLOCATION',entityId:id,beforeJson:{sampleId:current.sampleId,approvedRetase:current.approvedRetase},afterJson:{sampleId:updated.sampleId,approvedRetase:updated.approvedRetase},requestId});return allocationDto(updated);
    },
    async confirm(principal:AuthPrincipal,id:string,input:ConfirmRetaseAllocationRequest,requestId?:string){
      assertQc(principal);const current=await repository.getAllocation(id);if(!current)throw notFound('Retase allocation tidak ditemukan.');const assignment=await repository.getAssignment(current.assignmentId);if(!assignment)throw notFound('Loading assignment tidak ditemukan.');assertLimestone(assignment.materialKind);if(!current.sampleId)throw conflict('SAMPLE_REQUIRED','Sample_ID wajib sebelum confirm.');const candidates=await repository.listCandidates(current.assignmentId);if(!candidates.some(c=>c.id===current.sampleId))throw conflict('SAMPLE_MAPPING_STALE','Sample_ID tidak lagi valid berdasarkan field Vendor.');if(candidates.length>1&&!input.reason?.trim())throw new AppError(400,'MAPPING_REASON_REQUIRED','Reason wajib saat terdapat lebih dari satu Sample_ID candidate.');const approved=input.approvedRetase??current.approvedRetase;if(!approved||approved<=0)throw new AppError(400,'APPROVED_RETASE_REQUIRED','Approved Retase wajib > 0.');
      try{return allocationDto(await repository.confirmAllocation(id,{approvedRetase:approved,actorUserId:principal.userId,actorRoleSnapshot:principal.role,reason:input.reason??null,requestId}));}catch(e){const m=(e as Error).message;if(m.includes('melebihi remaining'))throw conflict('RETASE_EXCEEDS_REMAINING',m);if(m.includes('bukan effective'))throw conflict('UPSTREAM_REPORT_NOT_EFFECTIVE',m);if(m.includes('CONSUMED'))throw conflict('ALLOCATION_CONSUMED',m);throw e;}
    },
    async workbenchSuggestions(principal:AuthPrincipal,input:{materialKind:'LS'|'CL';operationDate:string}){assertQc(principal);if(input.materialKind==='CL')return [];await repository.markReviewRequiredForDrift(input.operationDate);const rows=await repository.listWorkbenchSuggestions(input);return rows.map(x=>({...x,allocationIds:x.sources.map(s=>s.allocationId),allocationCount:x.sources.length})) satisfies WorkbenchRetaseSuggestion[];},
  };
}
export type ReconciliationService=ReturnType<typeof createReconciliationService>;
