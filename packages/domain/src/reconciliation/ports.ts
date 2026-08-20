import type { MappingStatus, MaterialKind, ShiftCode } from '@qc/contracts';
import type { AuditWriteInput } from '../master/types';
import type { AllocationWriteInput, ReconciliationAssignmentRecord, ReconciliationCandidateRecord, ReconciliationExceptionRecord, ReconciliationExceptionAssignmentCandidateRecord, RetaseAllocationRecord, WorkbenchRetaseSuggestionRecord } from './types';

export interface ReconciliationFilter {
  operationDate:string; shiftCode?:ShiftCode|undefined; crusherId?:string|undefined; vendorId?:string|undefined; materialKind?:MaterialKind|undefined; mappingStatus?:MappingStatus|undefined; search?:string|undefined;
}

export interface ReconciliationRepository {
  listAssignments(filter:ReconciliationFilter):Promise<ReconciliationAssignmentRecord[]>;
  getAssignment(assignmentId:string):Promise<ReconciliationAssignmentRecord|null>;
  listCandidates(assignmentId:string):Promise<ReconciliationCandidateRecord[]>;
  listExceptions(filter:ReconciliationFilter):Promise<ReconciliationExceptionRecord[]>;
  listExceptionAssignmentCandidates(eventId:string):Promise<ReconciliationExceptionAssignmentCandidateRecord[]>;
  resolveExceptionEvent(input:{eventId:string;assignmentId:string;reason:string;actorUserId:string;actorRoleSnapshot:string;requestId?:string|undefined}):Promise<void>;
  listAssignmentEvents(assignmentId:string):Promise<Array<{id:string;eventTs:Date;aaUnitNo:string|null;delta:number;eventType:string;status:string;createdByName:string;reason:string|null}>>;
  getAllocation(id:string):Promise<RetaseAllocationRecord|null>;
  createAllocation(input:AllocationWriteInput):Promise<RetaseAllocationRecord>;
  updateAllocation(id:string,patch:{sampleId?:string|undefined;approvedRetase?:number|null|undefined;candidateCount?:number|undefined;note?:string|null|undefined;updatedBy:string}):Promise<RetaseAllocationRecord|null>;
  confirmAllocation(id:string,input:{approvedRetase:number;actorUserId:string;actorRoleSnapshot:string;reason?:string|null|undefined;requestId?:string|undefined}):Promise<RetaseAllocationRecord>;
  markReviewRequiredForDrift(operationDate:string):Promise<number>;
  listWorkbenchSuggestions(input:{materialKind:MaterialKind;operationDate:string}):Promise<WorkbenchRetaseSuggestionRecord[]>;
  appendAudit(input:AuditWriteInput):Promise<void>;
}
