import type { AssignmentOrigin, MaterialKind, ShiftCode } from '@qc/contracts';

export interface CounterAssignmentAaRecord {
  assignmentAaId: string;
  aaId: string;
  unitNo: string;
  brand: string | null;
  model: string | null;
  confirmedCount: number;
  lastEventAt: Date | null;
}

export interface CounterAssignmentRecord {
  id: string;
  assignmentOrigin: AssignmentOrigin;
  operationDate: string;
  shiftCode: ShiftCode;
  reportId: string | null;
  reportVersion: number | null;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  amId: string;
  amUnitNo: string;
  sourceId: string | null;
  sourceCode: string | null;
  sourceName: string | null;
  blockSnapshot: string | null;
  materialKind: MaterialKind;
  materialCategory: string;
  crusherId: string;
  crusherCode: string;
  crusherName: string;
  plantId: string | null;
  plantCode: string | null;
  plantName: string | null;
  pileId: string | null;
  pileCode: string | null;
  pileName: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  note: string | null;
  createdBy: string | null;
  createdByName: string | null;
  updatedAt: Date;
  aa: CounterAssignmentAaRecord[];
}

export interface AssignmentAaResolutionRecord {
  assignmentAaId: string;
  assignmentId: string;
  assignmentOrigin: AssignmentOrigin;
  reportId: string | null;
  reportVersion: number | null;
  operationDate: string;
  shiftCode: ShiftCode;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  amId: string;
  amUnitNo: string;
  aaId: string;
  aaUnitNo: string;
  sourceId: string | null;
  sourceCode: string | null;
  sourceName: string | null;
  blockSnapshot: string | null;
  materialKind: MaterialKind;
  materialCategory: string;
  crusherId: string;
  crusherCode: string;
  crusherName: string;
  pileId: string | null;
  pileCode: string | null;
  pileName: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export interface RetaseEventWriteRecord {
  requestId: string;
  operationDate: string;
  shiftCode: ShiftCode;
  crusherId: string;
  vendorId: string | null;
  reportId: string | null;
  reportVersion: number | null;
  assignmentId: string | null;
  assignmentAaId: string | null;
  assignmentOrigin: AssignmentOrigin | null;
  amId: string | null;
  aaId: string | null;
  sourceId: string | null;
  pileId: string | null;
  blockSnapshot: string | null;
  materialKind: MaterialKind | null;
  materialCategory: string | null;
  vendorNameSnapshot: string | null;
  amUnitNoSnapshot: string | null;
  aaUnitNoSnapshot: string | null;
  delta: 1 | -1;
  eventType: 'DUMP' | 'REVERSAL' | 'MANUAL_CORRECTION';
  status: 'VALID' | 'EXCEPTION_UNASSIGNED' | 'AMBIGUOUS' | 'REVERSED';
  createdBy: string;
  reversesEventId: string | null;
  reason: string | null;
  clientTs: Date | null;
}

export interface RetaseEventRecord extends RetaseEventWriteRecord {
  id: string;
  eventTs: Date;
  crusherCode: string;
  crusherName: string;
  vendorName: string | null;
  sourceCode: string | null;
  pileCode: string | null;
  pileName: string | null;
  createdByName: string;
}

export interface RetaseListFilter {
  operationDate: string;
  shiftCode: ShiftCode;
  crusherId: string;
  vendorId?: string | undefined;
  aaId?: string | undefined;
  limit: number;
  offset: number;
}

export interface OperationalAssignmentWriteRecord {
  operationDate:string; shiftCode:ShiftCode; vendorId:string; amId:string; sourceId:string|null; crusherId:string; pileId:string|null;
  blockSnapshot:string|null; materialKind:MaterialKind; materialCategory:string; validFrom:string|null; validTo:string|null; note:string|null; aaIds:string[];
}

export interface OperationalAssignmentListFilter {
  operationDate:string; shiftCode:ShiftCode; vendorId?:string|undefined; crusherId?:string|undefined; status?:'ACTIVE'|'CLOSED'|'CANCELLED'|undefined;
}

export interface RetaseSummaryRecord {
  totalNet: number;
  dumpEvents: number;
  reversalEvents: number;
  unassignedEvents: number;
  ambiguousEvents: number;
  byVendor: Array<{ id: string | null; label: string; retase: number }>;
  byAm: Array<{ id: string | null; label: string; retase: number }>;
  byAa: Array<{ id: string | null; label: string; retase: number }>;
  hourly: Array<{ hour: string; retase: number }>;
}
