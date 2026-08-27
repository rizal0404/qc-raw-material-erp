import type { AuditWriteInput } from '../master/types';
import type { ShiftReportListFilter, ShiftReportWriteRecord, VendorShiftReportRecord } from './types';
import type { MaterialKind } from '@qc/contracts';

export interface VendorShiftReportLookup {
  vendorId: string;
  operationDate: string;
  shiftCode: 'SHIFT_1' | 'SHIFT_2' | 'SHIFT_3';
  materialKind: MaterialKind;
}

export interface VendorShiftReportRepository {
  getCurrent(input: VendorShiftReportLookup): Promise<VendorShiftReportRecord | null>;
  getEffectiveSubmitted(input: VendorShiftReportLookup): Promise<VendorShiftReportRecord | null>;
  getById(id: string): Promise<VendorShiftReportRecord | null>;
  list(filter: ShiftReportListFilter): Promise<{ items: VendorShiftReportRecord[]; total: number }>;
  createDraft(input: ShiftReportWriteRecord, actorUserId: string, revisesReportId?: string | null, revisionReason?: string | null): Promise<VendorShiftReportRecord>;
  replaceDraft(reportId: string, input: Omit<ShiftReportWriteRecord, 'operationDate' | 'shiftCode' | 'vendorId' | 'materialKind'>, actorUserId: string): Promise<VendorShiftReportRecord>;
  submit(reportId: string, actorUserId: string): Promise<VendorShiftReportRecord>;
  createRevision(reportId: string, actorUserId: string, reason: string): Promise<VendorShiftReportRecord>;
  appendAudit(input: AuditWriteInput): Promise<void>;
}
