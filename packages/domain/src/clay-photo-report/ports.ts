import type {
  ClayPhotoReportDraft,
  ClayPhotoReportImport,
  ClayPhotoReportWorkerResult,
  CrusherReportIssue,
  OreVisionDiagnostics,
} from "@qc/contracts";
import type { AuthPrincipal } from "../iam/types";

export interface ClayPhotoTargetState {
  reportId: string | null;
  status: string | null;
  columnCount: number;
  logCount: number;
  retaseCount: number;
}

export interface ClayPhotoReportRepository {
  transaction<T>(
    work: (repository: ClayPhotoReportRepository) => Promise<T>,
  ): Promise<T>;
  lock(id: string): Promise<void>;
  lockContext(input: {
    crusherId: string;
    operationDate: string;
    shiftCode: string;
  }): Promise<void>;
  get(id: string): Promise<ClayPhotoReportImport | null>;
  list(crusherId: string): Promise<ClayPhotoReportImport[]>;
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
    draft: ClayPhotoReportDraft,
    issues: CrusherReportIssue[],
    actor: AuthPrincipal,
  ): Promise<void>;
  target(input: {
    crusherId: string;
    operationDate: string;
    shiftCode: string;
  }): Promise<ClayPhotoTargetState>;
  confirm(input: {
    item: ClayPhotoReportImport;
    actor: AuthPrincipal;
    draft: ClayPhotoReportDraft;
  }): Promise<string>;
  claim(
    id: string,
  ): Promise<{ id: string; bytes: Buffer; leaseToken: string } | null>;
  finish(
    id: string,
    leaseToken: string,
    result: ClayPhotoReportWorkerResult,
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
