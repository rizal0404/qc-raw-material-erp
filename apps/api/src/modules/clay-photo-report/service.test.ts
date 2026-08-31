import { describe, expect, it, vi } from "vitest";
import type {
  AuthPrincipal,
  ClayPhotoReportRepository,
  MasterRepository,
} from "@qc/domain";
import type {
  ClayPhotoReportDraft,
  ClayPhotoReportImport,
} from "@qc/contracts";
import { createClayPhotoReportService } from "./service";

const id = "10000000-0000-4000-8000-000000000001";
const actor = {
  userId: "20000000-0000-4000-8000-000000000001",
  role: "QC_ANALYST",
  crusherIds: [],
} as unknown as AuthPrincipal;
const hours = [15, 16, 17, 18, 19, 20, 21, 22];
const baseDraft = (): ClayPhotoReportDraft => ({
  schemaVersion: "1.0",
  operationDate: "2026-08-18",
  shiftCode: "SHIFT_2",
  timezone: "Asia/Makassar",
  hours,
  header: { day: "Selasa", operatorName: "Operator" },
  production: {
    productionTonnage: 314.51,
    runningMinutes: 300,
    totalRunningMinutes: 300,
    capacityTph: null,
    stockPercent: 5.51,
  },
  operation: {
    pickupLocation: "Buffer / all area",
    weather: "Cerah",
    pileFilling: "Selatan 4-8",
  },
  chemistry: { sm: null, sio2: null, h2o: null },
  attendance: {
    present: null,
    sick: null,
    overtime: null,
    permission: null,
    leave: null,
  },
  columns: [
    {
      blockKey: "column-1",
      displayOrder: 0,
      headerPrimary: "BUFFER",
      headerSecondary: "TRASS",
      vendorId: null,
      sourceId: null,
      pileId: null,
      vendorNameSnapshot: null,
      sourceNameSnapshot: "BUFFER / TRASS",
      inputMode: "BUFFER",
      tonPerRetaseSnapshot: null,
      hourly: hours.map((hour, index) => ({
        hour,
        retase: index === 0 ? 1 : null,
      })),
      totalRetase: 1,
      reviewed: true,
    },
  ],
  operationLogs: [],
  note: null,
  document: {
    title: "Laporan Harian Clay Crusher",
    formNumber: null,
    signedBy: null,
    provider: "gemini",
    model: "test",
  },
});

function setup(targetCount = 0) {
  const item: ClayPhotoReportImport = {
    id,
    crusherId: id,
    fileName: "clay.jpg",
    sha256: "a".repeat(64),
    status: "NEEDS_REVIEW",
    revision: 2,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    parserVersion: "test",
    templateVersion: "test",
    draft: baseDraft(),
    observations: [],
    issues: [],
    error: null,
    hasAlignedImage: true,
    reportId: null,
  };
  const repository = {
    get: vi.fn(async () => item),
    lock: vi.fn(),
    lockContext: vi.fn(),
    target: vi.fn(async () => ({
      reportId: targetCount ? id : null,
      status: targetCount ? "DRAFT" : null,
      columnCount: targetCount,
      logCount: 0,
      retaseCount: 0,
    })),
    confirm: vi.fn(async () => {
      item.status = "CONFIRMED";
      item.reportId = id;
      return id;
    }),
    saveDraft: vi.fn(),
    transaction: async (work: any) => work(repository),
  } as unknown as ClayPhotoReportRepository;
  const master = {
    findCrusherById: vi.fn(async () => ({
      id,
      active: true,
      materialKind: "CL",
    })),
    listShifts: vi.fn(async () => [
      {
        code: "SHIFT_2",
        name: "Shift 2",
        startTime: "15:30",
        endTime: "22:30",
        crossesMidnight: false,
        active: true,
      },
    ]),
    findVendorById: vi.fn(async () => null),
    findSourceById: vi.fn(async () => null),
    findPileById: vi.fn(async () => null),
  } as unknown as MasterRepository;
  return {
    item,
    repository,
    service: createClayPhotoReportService(repository, master),
  };
}

describe("Clay photo report confirmation", () => {
  it("requires every extracted column to be human-reviewed", async () => {
    const { item, service, repository } = setup();
    item.draft!.columns[0]!.reviewed = false;
    await expect(service.confirm(actor, id, item.revision)).rejects.toMatchObject(
      { code: "CLAY_REPORT_REVIEW_REQUIRED" },
    );
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("atomically hands a reviewed empty context to the Clay workbench", async () => {
    const { item, service, repository } = setup();
    const result = await service.confirm(actor, id, item.revision);
    expect(repository.lockContext).toHaveBeenCalledWith({
      crusherId: id,
      operationDate: "2026-08-18",
      shiftCode: "SHIFT_2",
    });
    expect(repository.confirm).toHaveBeenCalled();
    expect(repository.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        draft: expect.objectContaining({
          attendance: {
            present: null,
            sick: null,
            overtime: null,
            permission: null,
            leave: null,
          },
          columns: [
            expect.objectContaining({
              headerSecondary: null,
              pileId: null,
              totalRetase: null,
            }),
          ],
        }),
      }),
    );
    expect(result.status).toBe("CONFIRMED");
  });

  it("blocks import into a report that already has manual columns", async () => {
    const { item, service, repository } = setup(1);
    await expect(service.confirm(actor, id, item.revision)).rejects.toMatchObject(
      { code: "CLAY_REPORT_CONTEXT_NOT_EMPTY" },
    );
    expect(repository.confirm).not.toHaveBeenCalled();
  });

  it("keeps an incomplete operation-log time pair as a warning", async () => {
    const { item, service, repository } = setup();
    item.draft!.operationLogs = [
      {
        displayOrder: 0,
        startTime: "17:26",
        endTime: null,
        category: "STOP",
        description: "Stop sementara",
      },
    ];

    await expect(
      service.confirm(actor, id, item.revision),
    ).resolves.toMatchObject({ status: "CONFIRMED" });
    expect(repository.confirm).toHaveBeenCalled();
  });

  it("blocks a retained vendor/source column without retase", async () => {
    const { item, service, repository } = setup();
    item.draft!.columns[0]!.hourly.forEach((cell) => (cell.retase = null));

    await expect(
      service.confirm(actor, id, item.revision),
    ).rejects.toMatchObject({
      code: "CLAY_REPORT_REVIEW_REQUIRED",
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            code: "CLAY_VENDOR_RETASE_REQUIRED",
            severity: "BLOCKING",
          }),
        ]),
      },
    });
    expect(repository.confirm).not.toHaveBeenCalled();
  });
});
