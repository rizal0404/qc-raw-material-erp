import type { ShiftCode } from '@qc/contracts';
import type { AssignmentAaResolutionRecord, ClayCounterColumnRecord, CounterAssignmentRecord, OperationalAssignmentListFilter, OperationalAssignmentWriteRecord, RetaseEventRecord, RetaseEventWriteRecord, RetaseListFilter, RetaseSummaryRecord } from './types';
import type { AuditWriteInput } from '../master/types';

export interface CounterLookup {
  operationDate:string;
  shiftCode:ShiftCode;
  crusherId:string;
}

export interface RetaseEventRepository {
  listCounterAssignments(input:CounterLookup):Promise<CounterAssignmentRecord[]>;
  listAssignmentCandidatesForAa(input:CounterLookup & {aaId:string}):Promise<AssignmentAaResolutionRecord[]>;
  getAssignmentAaById(assignmentAaId:string):Promise<AssignmentAaResolutionRecord|null>;
  getClayCounterColumn(columnId:string):Promise<ClayCounterColumnRecord|null>;
  findByRequestId(requestId:string):Promise<RetaseEventRecord|null>;
  getEventById(id:string):Promise<RetaseEventRecord|null>;
  appendEvent(input:RetaseEventWriteRecord):Promise<RetaseEventRecord>;
  getEventConsumption(eventId:string):Promise<{allocationId:string;mixId:string;mixCode:string|null}|null>;
  reverseEvent(input:{originalEventId:string;reversal:RetaseEventWriteRecord}):Promise<RetaseEventRecord>;
  findLatestReversibleByActor(input:CounterLookup & {actorUserId:string}):Promise<RetaseEventRecord|null>;
  listEvents(filter:RetaseListFilter):Promise<{items:RetaseEventRecord[];total:number}>;
  getSummary(input:CounterLookup):Promise<RetaseSummaryRecord>;
  countEffectiveSubmittedReports(input:CounterLookup):Promise<number>;
  listOperationalAssignments(filter:OperationalAssignmentListFilter):Promise<CounterAssignmentRecord[]>;
  getOperationalAssignment(id:string):Promise<CounterAssignmentRecord|null>;
  createOperationalAssignment(input:OperationalAssignmentWriteRecord,actorUserId:string):Promise<CounterAssignmentRecord>;
  updateOperationalAssignment(id:string,input:Omit<OperationalAssignmentWriteRecord,'operationDate'|'shiftCode'|'vendorId'>,actorUserId:string):Promise<CounterAssignmentRecord>;
  cancelOperationalAssignment(id:string,actorUserId:string):Promise<CounterAssignmentRecord>;
  appendAudit(input:AuditWriteInput):Promise<void>;
}
