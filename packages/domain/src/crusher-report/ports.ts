import type {
  CrusherReportDraft,
  CrusherReportImport,
  CrusherReportIssue,
  CrusherReportWorkerResult,
  OreVisionDiagnostics,
} from "@qc/contracts";
import type {
  AssignmentAaResolutionRecord,
  CounterAssignmentRecord,
} from "../retase/types";
import type { AuthPrincipal } from "../iam/types";

export interface CrusherReportRepository {
  transaction<T>(
    work: (repository: CrusherReportRepository) => Promise<T>,
  ): Promise<T>;
  lock(id: string): Promise<void>;
  get(id: string): Promise<CrusherReportImport | null>;
  list(crusherId: string): Promise<CrusherReportImport[]>;
  create(input: {
    crusherId: string;
    fileName: string;
    sha256: string;
    mimeType: string;
    bytes: Buffer;
    actorId: string;
  }): Promise<string>;
  file(
    id: string,
    aligned: boolean,
  ): Promise<{ bytes: Buffer; mimeType: string } | null>;
  deleteUnconfirmed(id: string, actor: AuthPrincipal): Promise<boolean>;
  saveDraft(
    id: string,
    draft: CrusherReportDraft,
    issues: CrusherReportIssue[],
    actor: AuthPrincipal,
  ): Promise<void>;
  candidates(input: {
    crusherId: string;
    operationDate: string;
    shiftCode: "SHIFT_1" | "SHIFT_2" | "SHIFT_3";
  }): Promise<CounterAssignmentRecord[]>;
  resolve(
    assignmentAaId: string,
    crusherId: string,
  ): Promise<AssignmentAaResolutionRecord | null>;
  lockAssignments(ids: string[]): Promise<void>;
  confirm(input: {
    item: CrusherReportImport;
    actor: AuthPrincipal;
    shiftStart: string;
    rows: Array<{
      vendorIndex: number;
      rowIndex: number;
      resolution: AssignmentAaResolutionRecord;
      retase: number;
    }>;
  }): Promise<string>;
  claim(
    id: string,
  ): Promise<{ id: string; bytes: Buffer; leaseToken: string } | null>;
  finish(
    id: string,
    leaseToken: string,
    result: CrusherReportWorkerResult,
    aligned: Buffer,
  ): Promise<void>;
  fail(
    id: string,
    leaseToken: string,
    message: string,
    diagnostics?: OreVisionDiagnostics,
  ): Promise<void>;
  requeue(id: string): Promise<void>;
}
