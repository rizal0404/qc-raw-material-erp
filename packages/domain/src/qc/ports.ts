import type { Chemistry, MaterialKind, ClayRetaseUse, ClayWorkbenchSource } from '@qc/contracts';
import type { AuditWriteInput } from '../master/types';
import type { MixSummaryRecord, MixView, RawSampleRecord } from './types';
import type { TonPerRetaseRule } from './ton-per-retase';
import type { QafRuleSet } from './qaf';

export interface RawSampleFilter { materialKind?: MaterialKind | undefined; operationDate?: string | undefined; vendorId?: string | undefined; sourceId?: string | undefined; search?: string | undefined; limit: number; offset: number; }
export interface RawSampleWriteInput extends Omit<RawSampleRecord, 'id'|'createdAt'|'updatedAt'> {}
export interface MixListFilter { materialKind?: MaterialKind | undefined; operationDate?: string | undefined; pileId?: string | undefined; status?: 'ACTIVE'|'REPLACED'|'VOID' | undefined; search?: string | undefined; limit: number; offset: number; }
export interface SaveMixRepositoryInput {
  mixCode: string; materialKind: MaterialKind; operationDate: string; pileId: string; shiftCode: string; batchNo: number | null; tiangKe: string | null; pileCycle: number;
  defaultTonPerRetase: number; note: string | null; createdBy: string; replacesMixId?: string | null;
  items: Array<{ rawSampleId: string; retase: number; tonPerRetase: number; chemistry: Chemistry; note: string | null; oxideChangeNote: string | null; retaseAllocationIds: string[]; clayRetaseSources: ClayRetaseUse[]; retaseOverrideReason: string | null }>;
}
export interface QcRepository {
  listClayWorkbenchSources(operationDate: string, shiftCode: string): Promise<ClayWorkbenchSource[]>;
  listRawSamples(filter: RawSampleFilter): Promise<{ items: RawSampleRecord[]; total: number }>;
  nextRawSampleNumber(): Promise<number>;
  findRawSampleById(id: string): Promise<RawSampleRecord | null>;
  findRawSampleBySampleId(sampleId: string): Promise<RawSampleRecord | null>;
  createRawSample(input: RawSampleWriteInput): Promise<RawSampleRecord>;
  updateRawSample(id: string, patch: Partial<RawSampleWriteInput>): Promise<RawSampleRecord | null>;
  importRawSamples(rows: RawSampleWriteInput[], mode: 'INSERT_ONLY'|'UPSERT'): Promise<{ inserted: number; updated: number; skipped: number }>;
  listTonPerRetaseRules(materialKind?: MaterialKind): Promise<TonPerRetaseRule[]>;
  getQafRules(plantId?: string): Promise<QafRuleSet>;
  findPileContext(pileId: string): Promise<{ id: string; code: string; name: string; materialKind: MaterialKind; plantId: string | null; plantCode: string | null; plantName: string | null; className: string | null } | null>;
  listMixes(filter: MixListFilter): Promise<{ items: Omit<MixView,'items'>[]; total: number }>;
  getMixByCode(mixCode: string): Promise<MixView | null>;
  hasConfirmedRetaseAllocation(sampleId: string, operationDate: string): Promise<boolean>;
  saveMix(input: SaveMixRepositoryInput): Promise<MixView>;
  replaceMix(existingMixId: string, input: SaveMixRepositoryInput, reason: string, actorUserId: string, actorRoleSnapshot: string, requestId?: string): Promise<MixView>;
  reviseMixItemChemistry(mixItemId: string, chemistry: Chemistry, reason: string, actorUserId: string, actorRoleSnapshot: string, requestId?: string): Promise<MixView | null>;
  listMixItemRevisions(mixItemId: string): Promise<Array<{ revisionNo:number; before:Chemistry; after:Chemistry; reason:string; changedBy:string; changedByName:string; changedAt:Date }>>;
  listMixSummaries(filter: { materialKind?: MaterialKind | undefined; dateFrom?: string | undefined; dateTo?: string | undefined; plantId?: string | undefined; pileId?: string | undefined }): Promise<MixSummaryRecord[]>;
  appendAudit(input: AuditWriteInput): Promise<void>;
}
