import type { Chemistry, MaterialKind, Quality } from '@qc/contracts';

export interface RawSampleRecord {
  id: string; sampleId: string; materialKind: MaterialKind; operationDate: string; noSample: string | null; sourceShift: string | null; typeGrade: string | null;
  vendorId: string | null; vendorSnapshot: string | null; sourceId: string | null; sourceSnapshot: string | null; plantId: string | null;
  loaderUnitNo: string | null; block: string | null; direction: string | null; chemistry: Chemistry; note: string | null; createdAt: Date; updatedAt: Date;
}
export interface RawSampleView extends RawSampleRecord { quality: Quality; }
export interface MixItemView {
  id: string; rawSampleId: string; sampleId: string; noSample: string | null; typeGrade: string | null; vendorSnapshot: string | null; sourceSnapshot: string | null;
  retase: number; tonPerRetase: number; tonnage: number; chemistry: Chemistry; quality: Quality; note: string | null; hasChemistryRevision: boolean;
  retaseAllocationIds: string[]; mappedRetaseConsumed: number; clayRetaseSources: import('@qc/contracts').ClayRetaseUse[];
}
export interface MixView {
  id: string; mixCode: string; materialKind: MaterialKind; operationDate: string; pileId: string; pileCode: string; pileName: string;
  plantId: string | null; plantCode: string | null; plantName: string | null; className: string | null; shiftCode: string; batchNo: number | null; tiangKe: string | null;
  pileCycle: number; defaultTonPerRetase: number; status: 'ACTIVE'|'REPLACED'|'VOID'; replacesMixId: string | null; note: string | null; createdAt: Date; updatedAt: Date; items: MixItemView[];
}
export interface MixSummaryRecord {
  mixId: string; mixCode: string; materialKind: MaterialKind; operationDate: string; plantId: string | null; plantCode: string | null; plantName: string | null;
  pileId: string; pileCode: string; pileName: string; className: string | null; shiftCode: string; locationRef: string; pileCycle: number; totalTon: number;
  chemistry: Chemistry; quality: Quality; notes: string | null; createdAt: Date;
}
