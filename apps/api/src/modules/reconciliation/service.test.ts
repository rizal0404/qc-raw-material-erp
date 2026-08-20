import { describe, expect, it, vi } from 'vitest';
import type {
  AuthPrincipal,
  ReconciliationAssignmentRecord,
  ReconciliationCandidateRecord,
  ReconciliationExceptionAssignmentCandidateRecord,
  ReconciliationRepository,
  RetaseAllocationRecord,
} from '@qc/domain';
import { createReconciliationService } from './service';

const userId = '00000000-0000-4000-8000-000000000001';
const assignmentId = '00000000-0000-4000-8000-000000000101';
const sampleA = '00000000-0000-4000-8000-000000000201';
const sampleB = '00000000-0000-4000-8000-000000000202';
const allocationId = '00000000-0000-4000-8000-000000000301';

const principal: AuthPrincipal = {
  sessionId: '00000000-0000-4000-8000-000000000002',
  userId,
  username: 'qc',
  displayName: 'QC Analyst',
  role: 'QC_ANALYST',
  vendorId: null,
  status: 'ACTIVE',
  crusherIds: [],
  lastLoginAt: null,
  sessionExpiresAt: new Date('2026-08-20T08:00:00Z'),
  sessionLastSeenAt: new Date('2026-08-20T00:00:00Z'),
};

const baseAssignment: ReconciliationAssignmentRecord = {
  assignmentId,
  assignmentOrigin: 'SHIFT_REPORT',
  reportId: '00000000-0000-4000-8000-000000000401',
  reportVersion: 1,
  reportStatus: 'SUBMITTED',
  operationDate: '2026-08-20',
  shiftCode: 'SHIFT_1',
  crusherId: '00000000-0000-4000-8000-000000000501',
  crusherCode: 'CR_LS_5',
  crusherName: 'CR LS 5',
  vendorId: '00000000-0000-4000-8000-000000000601',
  vendorCode: 'V001',
  vendorName: 'Vendor A',
  amId: '00000000-0000-4000-8000-000000000701',
  amUnitNo: 'AM-01',
  sourceId: null,
  sourceCode: null,
  sourceName: null,
  blockSnapshot: 'B9 Tengah',
  materialKind: 'LS',
  materialCategory: 'PILE',
  assignedAaCount: 3,
  aaWithDumpCount: 3,
  observedRetase: 10,
  reservedRetase: 0,
  consumedRetase: 0,
  remainingRetase: 10,
  reviewRequired: false,
  allocations: [],
};

function candidate(id: string, sampleId: string): ReconciliationCandidateRecord {
  return {
    id,
    sampleId,
    materialKind: 'LS',
    operationDate: '2026-08-20',
    vendorId: baseAssignment.vendorId,
    vendorSnapshot: 'Vendor A',
    sourceId: null,
    sourceSnapshot: null,
    block: null,
    typeGrade: null,
    chemistry: { sio2: 12, al2o3: 3, fe2o3: 2, cao: 50, mgo: 1, k2o: 0.4, na2o: 0.2, so3: 0.1, h2o: 1 },
    quality: { lsf: 130.89, sm: 2.4, am: 1.5, naeq: 0.4632, r2o3: 17 },
    matchMode: 'VENDOR_ID',
  };
}

function allocation(): RetaseAllocationRecord {
  return {
    id: allocationId,
    assignmentId,
    sampleId: sampleA,
    sampleCode: 'LS001',
    mappingStatus: 'SUGGESTED',
    observedRetase: 10,
    approvedRetase: 10,
    consumedRetase: 0,
    candidateCount: 1,
    note: null,
    overrideReason: null,
    reviewRequired: false,
    reviewReason: null,
    confirmedBy: null,
    confirmedByName: null,
    confirmedAt: null,
    consumedMixId: null,
    consumedMixCode: null,
    consumedAt: null,
    createdBy: userId,
    createdAt: new Date('2026-08-20T00:00:00Z'),
    updatedAt: new Date('2026-08-20T00:00:00Z'),
  };
}

function repository(overrides: Partial<ReconciliationRepository> = {}): ReconciliationRepository {
  const base: ReconciliationRepository = {
    listAssignments: vi.fn(async () => [baseAssignment]),
    getAssignment: vi.fn(async () => baseAssignment),
    listCandidates: vi.fn(async () => [candidate(sampleA, 'LS001')]),
    listExceptions: vi.fn(async () => []),
    listExceptionAssignmentCandidates: vi.fn(async () => []),
    resolveExceptionEvent: vi.fn(async () => undefined),
    listAssignmentEvents: vi.fn(async () => []),
    getAllocation: vi.fn(async () => allocation()),
    createAllocation: vi.fn(async () => allocation()),
    updateAllocation: vi.fn(async () => allocation()),
    confirmAllocation: vi.fn(async (): Promise<RetaseAllocationRecord> => ({ ...allocation(), mappingStatus: 'CONFIRMED', confirmedBy: userId, confirmedAt: new Date() })),
    markReviewRequiredForDrift: vi.fn(async () => 0),
    listWorkbenchSuggestions: vi.fn(async () => []),
    appendAudit: vi.fn(async () => undefined),
  };
  return { ...base, ...overrides };
}

describe('Slice 06 reconciliation service', () => {
  it('derives SUGGESTED when exactly one Vendor candidate exists', async () => {
    const service = createReconciliationService(repository());
    const result = await service.list(principal, { operationDate: '2026-08-20' });
    expect(result.items[0]?.mappingStatus).toBe('SUGGESTED');
    expect(result.items[0]?.suggestedSampleCode).toBe('LS001');
  });

  it('derives AMBIGUOUS when Vendor maps to multiple Sample_ID candidates', async () => {
    const repo = repository({ listCandidates: vi.fn(async () => [candidate(sampleA, 'LS001'), candidate(sampleB, 'LS002')]) });
    const service = createReconciliationService(repo);
    const result = await service.list(principal, { operationDate: '2026-08-20' });
    expect(result.items[0]?.mappingStatus).toBe('AMBIGUOUS');
    expect(result.items[0]?.exception).toContain('2 Sample_ID candidate');
  });

  it('keeps AMBIGUOUS derived state even when an open allocation already exists', async () => {
    const repo = repository({
      listCandidates: vi.fn(async () => [candidate(sampleA, 'LS001'), candidate(sampleB, 'LS002')]),
      listAssignments: vi.fn(async (): Promise<ReconciliationAssignmentRecord[]> => [{ ...baseAssignment, allocations: [{ ...allocation(), mappingStatus: 'SUGGESTED', candidateCount: 2 }] }]),
    });
    const service = createReconciliationService(repo);
    const result = await service.list(principal, { operationDate: '2026-08-20' });
    expect(result.items[0]?.mappingStatus).toBe('AMBIGUOUS');
  });

  it('requires a reason when confirming one of multiple Vendor candidates', async () => {
    const repo = repository({
      listCandidates: vi.fn(async () => [candidate(sampleA, 'LS001'), candidate(sampleB, 'LS002')]),
      getAllocation: vi.fn(async () => ({ ...allocation(), candidateCount: 2 })),
    });
    const service = createReconciliationService(repo);
    await expect(service.confirm(principal, allocationId, { approvedRetase: 8 })).rejects.toMatchObject({ code: 'MAPPING_REASON_REQUIRED' });
  });

  it('allows resolving an exception only to one of server-derived assignment candidates', async () => {
    const resolveExceptionEvent = vi.fn(async () => undefined);
    const repo = repository({
      listExceptionAssignmentCandidates: vi.fn(async (): Promise<ReconciliationExceptionAssignmentCandidateRecord[]> => [{
        assignmentId,
        assignmentOrigin: 'SHIFT_REPORT',
        reportId: baseAssignment.reportId,
        reportVersion: 1,
        vendorId: baseAssignment.vendorId,
        vendorName: baseAssignment.vendorName,
        amId: baseAssignment.amId,
        amUnitNo: baseAssignment.amUnitNo,
        sourceId: null,
        sourceName: null,
        blockSnapshot: 'B9 Tengah',
        materialKind: 'LS',
        materialCategory: 'PILE',
        crusherId: baseAssignment.crusherId,
        crusherName: baseAssignment.crusherName,
        aaListed: false,
      }]),
      resolveExceptionEvent,
    });
    const service = createReconciliationService(repo);
    await service.resolveException(principal, '00000000-0000-4000-8000-000000000901', { assignmentId, reason: 'Unit pengganti dikonfirmasi QC.' });
    expect(resolveExceptionEvent).toHaveBeenCalledOnce();
  });
});
