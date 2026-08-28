import type { FleetSummary, MaterialKind, ShiftCode, ShiftReportStatus } from '@qc/contracts';

export interface AssignmentAaRecord {
  id: string;
  assignmentAaId: string;
  unitNo: string;
  brand: string | null;
  model: string | null;
}

export interface LoadingAssignmentRecord {
  id: string;
  reportId: string;
  operationDate: string;
  shiftCode: ShiftCode;
  vendorId: string;
  amId: string;
  amUnitNo: string;
  amBrand: string | null;
  amModel: string | null;
  sourceId: string;
  sourceCode: string;
  sourceName: string;
  blockSnapshot: string | null;
  materialCategory: string;
  materialKind: MaterialKind;
  crusherId: string | null;
  crusherCode: string | null;
  crusherName: string | null;
  pileId: string | null;
  pileCode: string | null;
  pileName: string | null;
  validFrom: string | null;
  validTo: string | null;
  status: 'ACTIVE' | 'CLOSED' | 'CANCELLED';
  note: string | null;
  aa: AssignmentAaRecord[];
}

export interface VendorShiftReportRecord {
  id: string;
  operationDate: string;
  shiftCode: ShiftCode;
  vendorId: string;
  vendorCode: string;
  vendorName: string;
  materialKind: MaterialKind;
  version: number;
  status: ShiftReportStatus;
  am: FleetSummary;
  aa: FleetSummary;
  note: string | null;
  revisionReason: string | null;
  revisesReportId: string | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  submittedByName: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  assignments: LoadingAssignmentRecord[];
}

export interface AssignmentWriteRecord {
  amId: string;
  sourceId: string;
  blockSnapshot: string | null;
  materialCategory: string;
  materialKind: MaterialKind;
  crusherId: string | null;
  pileId: string | null;
  validFrom: string | null;
  validTo: string | null;
  note: string | null;
  aaIds: string[];
}

export interface ShiftReportWriteRecord {
  operationDate: string;
  shiftCode: ShiftCode;
  vendorId: string;
  materialKind: MaterialKind;
  am: FleetSummary;
  aa: FleetSummary;
  note: string | null;
  assignments: AssignmentWriteRecord[];
}

export interface ShiftReportListFilter {
  vendorId?: string;
  operationDate?: string;
  shiftCode?: ShiftCode;
  status?: ShiftReportStatus;
  materialKind?: MaterialKind;
  limit: number;
  offset: number;
}
