import type { AssignmentOrigin, Chemistry, MappingStatus, MaterialKind, Quality, ShiftCode } from '@qc/contracts';

export interface ReconciliationCandidateRecord {
  id:string; sampleId:string; materialKind:MaterialKind; operationDate:string; vendorId:string|null; vendorSnapshot:string|null;
  sourceId:string|null; sourceSnapshot:string|null; block:string|null; typeGrade:string|null; chemistry:Chemistry; quality:Quality; matchMode:'AM_ID'|'VENDOR_ID'|'VENDOR_TEXT';
}

export interface RetaseAllocationRecord {
  id:string; assignmentId:string; sampleId:string|null; sampleCode:string|null; mappingStatus:MappingStatus;
  observedRetase:number; approvedRetase:number|null; consumedRetase:number; candidateCount:number; note:string|null; overrideReason:string|null;
  reviewRequired:boolean; reviewReason:string|null; confirmedBy:string|null; confirmedByName:string|null; confirmedAt:Date|null;
  consumedMixId:string|null; consumedMixCode:string|null; consumedAt:Date|null; createdBy:string|null; createdAt:Date; updatedAt:Date;
}

export interface ReconciliationAssignmentRecord {
  assignmentId:string; assignmentOrigin:AssignmentOrigin; reportId:string|null; reportVersion:number|null; reportStatus:string; operationDate:string; shiftCode:ShiftCode;
  crusherId:string|null; crusherCode:string; crusherName:string; vendorId:string; vendorCode:string; vendorName:string;
  amId:string; amUnitNo:string; sourceId:string|null; sourceCode:string|null; sourceName:string|null; blockSnapshot:string|null;
  materialKind:MaterialKind; materialCategory:string; assignedAaCount:number; assignedAaUnitNos?:string[]; aaWithDumpCount:number; observedRetase:number;
  reservedRetase:number; consumedRetase:number; remainingRetase:number; reviewRequired:boolean; allocations:RetaseAllocationRecord[];
}

export interface ReconciliationExceptionRecord {
  eventId:string; eventTs:Date; operationDate:string; shiftCode:ShiftCode; crusherId:string; crusherName:string;
  vendorId:string|null; vendorName:string|null; aaId:string|null; aaUnitNo:string|null; status:'EXCEPTION_UNASSIGNED'|'AMBIGUOUS'; reason:string|null;
}

export interface AllocationWriteInput {
  assignmentId:string; sampleId:string; observedRetase:number; approvedRetase:number|null; candidateCount:number; note:string|null; createdBy:string;
}

export interface WorkbenchRetaseSuggestionRecord {
  sampleId:string; sampleCode:string; mappedRetase:number;
  sources:Array<{allocationId:string;assignmentId:string;approvedRetase:number;vendorName:string;crusherName:string;amUnitNo:string;sourceName:string|null;blockSnapshot:string|null}>;
}

export interface ReconciliationExceptionAssignmentCandidateRecord {
  assignmentId:string; assignmentOrigin:AssignmentOrigin; reportId:string|null; reportVersion:number|null; vendorId:string; vendorName:string; amId:string; amUnitNo:string;
  sourceId:string|null; sourceName:string|null; blockSnapshot:string|null; materialKind:MaterialKind; materialCategory:string;
  crusherId:string; crusherName:string; aaListed:boolean;
}
