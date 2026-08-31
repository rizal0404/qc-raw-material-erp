import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import Fastify from "fastify";
import type {
  AuthPrincipal,
  CrusherReportRepository,
  MasterRepository,
} from "@qc/domain";
import type { CrusherReportDraft, CrusherReportImport } from "@qc/contracts";
import { createCrusherReportService, MAX_REPORT_IMAGE_BYTES } from "./service";
import { registerCrusherReportRoutes } from "./routes";
const id = "00000000-0000-4000-8000-000000000001";
const actor = {
  userId: id,
  role: "QC_ANALYST",
  crusherIds: [],
} as unknown as AuthPrincipal;
const draft: CrusherReportDraft = {
  schemaVersion: "1.0",
  reportDate: "2026-08-18",
  shiftCode: "SHIFT_2",
  timezone: "Asia/Makassar",
  hours: [15, 16, 17, 18, 19, 20, 21, 22],
  header: { day: null, operatorName: null, crusherCode: null },
  vendors: [
    {
      blockKey: "upper-left",
      vendorCode: "BATARA",
      vendorId: id,
      retaseTotal: 1,
      hourly: [15, 16, 17, 18, 19, 20, 21, 22].map((hour, i) => ({
        hour,
        retase: i === 0 ? 1 : 0,
      })),
      vehicles: [
        {
          rowIndex: 1,
          dtNo: "24",
          retase: 1,
          assignmentAaId: id,
          reviewed: true,
        },
      ],
    },
  ],
  production: {
    pileTon: null,
    fillerTon: null,
    totalTon: null,
    runningTimeHours: null,
    capacityTph: null,
  },
  pile: { baratPercent: null, timurPercent: null, totalPercent: null },
  notes: { raw: null },
  reportRetaseTotal: 1,
};
function setup(extract?: any) {
  const item: CrusherReportImport = {
    id,
    crusherId: id,
    fileName: "sample.jpg",
    sha256: "a".repeat(64),
    revision: 2,
    createdAt: new Date().toISOString(),
    confirmedAt: null,
    parserVersion: "0.1.0",
    templateVersion: "0.1.0",
    draft: structuredClone(draft),
    issues: [],
    observations: [],
    error: null,
    hasAlignedImage: true,
    reportId: null,
    status: "NEEDS_REVIEW",
  };
  const repo = {
    get: vi.fn(async () => item),
    lock: vi.fn(),
    saveDraft: vi.fn(),
    confirm: vi.fn(async () => {
      item.status = "CONFIRMED";
      return id;
    }),
    lockAssignments: vi.fn(),
    resolve: vi.fn(async () => ({
      assignmentAaId: id,
      assignmentId: id,
      aaId: id,
      vendorId: id,
      operationDate: draft.reportDate,
      shiftCode: draft.shiftCode,
      materialKind: "LS",
    })),
    create: vi.fn(async () => id),
    deleteUnconfirmed: vi.fn(async () => true),
    claim: vi.fn(async () => null),
    finish: vi.fn(async (_id, _token, result) => {
      item.status = "NEEDS_REVIEW";
      item.draft = result.draft;
      item.parserVersion = result.parserVersion;
      item.templateVersion = result.templateVersion;
      item.revision += 1;
    }),
    fail: vi.fn(async (_id, _token, message) => {
      item.status = "FAILED";
      item.error = message;
      item.revision += 1;
    }),
    requeue: vi.fn(async () => {
      item.status = "QUEUED";
      item.error = null;
      item.revision += 1;
    }),
    transaction: async (work: any) => work(repo),
  } as unknown as CrusherReportRepository;
  const master = {
    findCrusherById: vi.fn(async () => ({
      id,
      active: true,
      materialKind: "LS",
    })),
    listShifts: async () => [
      {
        code: "SHIFT_2",
        name: "2",
        startTime: "15:30",
        endTime: "22:30",
        crossesMidnight: false,
        active: true,
      },
    ],
    findVendorById: async () => ({ id, active: true, materialKinds: ["LS"] }),
    findEquipmentById: async () => ({
      id,
      vendorId: id,
      type: "AA",
      materialKinds: ["LS"],
      active: true,
      unitNo: "DT 024",
      aliases: [],
    }),
  } as unknown as MasterRepository;
  return {
    repo,
    master,
    item,
    service: createCrusherReportService(
      repo,
      master,
      extract ? { extract } : {},
    ),
  };
}
describe("inline photo extraction", () => {
  const output = {
    aligned: Buffer.from("aligned"),
    result: {
      draft: structuredClone(draft),
      observations: [],
      issues: [],
      parserVersion: "orevision-inline-test",
      templateVersion: "vision-report-test",
    },
  };
  it("claims only the uploaded import and returns the completed review draft", async () => {
    const extract = vi.fn().mockResolvedValue(output);
    const { service, repo, item } = setup(extract);
    item.status = "QUEUED";
    item.draft = null;
    vi.mocked(repo.claim).mockResolvedValue({
      id,
      bytes: Buffer.from("source"),
      leaseToken: "lease",
    });
    const result = await service.process(actor, id);
    expect(repo.claim).toHaveBeenCalledWith(id);
    expect(extract).toHaveBeenCalledWith(
      Buffer.from("source"),
      expect.objectContaining({ SHIFT_2: [15, 16, 17, 18, 19, 20, 21, 22] }),
    );
    expect(repo.finish).toHaveBeenCalledWith(
      id,
      "lease",
      output.result,
      output.aligned,
    );
    expect(result.status).toBe("NEEDS_REVIEW");
  });
  it("persists a sanitized failure and never substitutes demo data", async () => {
    const extract = vi
      .fn()
      .mockRejectedValue(new Error("private upstream body"));
    const { service, repo, item } = setup(extract);
    item.status = "QUEUED";
    vi.mocked(repo.claim).mockResolvedValue({
      id,
      bytes: Buffer.from("source"),
      leaseToken: "lease",
    });
    const result = await service.process(actor, id);
    expect(repo.finish).not.toHaveBeenCalled();
    expect(repo.fail).toHaveBeenCalledWith(
      id,
      "lease",
      "OreVision gagal di API. Periksa konfigurasi engine lalu ulangi ekstraksi.",
      undefined,
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).not.toContain("private upstream body");
  });
  it("does not duplicate work when another API invocation owns the lease", async () => {
    const extract = vi.fn();
    const { service, repo, item } = setup(extract);
    item.status = "PROCESSING";
    vi.mocked(repo.claim).mockResolvedValue(null);
    expect((await service.process(actor, id)).status).toBe("PROCESSING");
    expect(extract).not.toHaveBeenCalled();
    expect(repo.finish).not.toHaveBeenCalled();
  });
  it("reparse changes FAILED to QUEUED and processes it in the same API request", async () => {
    const extract = vi.fn().mockResolvedValue(output);
    const { service, repo, item } = setup(extract);
    item.status = "FAILED";
    vi.mocked(repo.claim).mockResolvedValue({
      id,
      bytes: Buffer.from("source"),
      leaseToken: "retry-lease",
    });
    expect((await service.reparse(actor, id)).status).toBe("NEEDS_REVIEW");
    expect(repo.requeue).toHaveBeenCalledWith(id);
    expect(repo.claim).toHaveBeenCalledWith(id);
  });
});

describe("photo import service", () => {
  it("validates and saves the latest reviewed payload in the same transaction as canonical events", async () => {
    const { service, repo, item } = setup(),
      latest = structuredClone(draft);
    item.draft!.vendors[0]!.vehicles[0]!.dtNo = "wrong parser value";
    latest.vendors[0]!.vehicles[0]!.equipmentId = id;
    latest.vendors[0]!.vehicles[0]!.retase = 2;
    latest.vendors[0]!.retaseTotal = 2;
    latest.vendors[0]!.hourly[0]!.retase = 2;
    latest.reportRetaseTotal = 2;
    await service.confirm(actor, id, 2, latest);
    expect(repo.saveDraft).toHaveBeenCalledWith(
      id,
      latest,
      expect.any(Array),
      actor,
    );
    expect(repo.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({ draft: latest }),
        rows: [expect.objectContaining({ retase: 2 })],
      }),
    );
    expect(vi.mocked(repo.saveDraft).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(repo.confirm).mock.invocationCallOrder[0]!,
    );
  });
  it("does not save or confirm an invalid latest payload", async () => {
    const { service, repo } = setup(),
      latest = structuredClone(draft);
    latest.vendors[0]!.vehicles[0]!.reviewed = false;
    await expect(service.confirm(actor, id, 2, latest)).rejects.toMatchObject({
      code: "REPORT_REVIEW_REQUIRED",
    });
    expect(repo.saveDraft).not.toHaveBeenCalled();
    expect(repo.confirm).not.toHaveBeenCalled();
  });
  it("checks explicitly linked equipment even for zero-retase rows", async () => {
    const { service, repo, master } = setup(),
      latest = structuredClone(draft);
    latest.vendors[0]!.vehicles[0] = {
      ...latest.vendors[0]!.vehicles[0]!,
      equipmentId: id,
      assignmentAaId: null,
      retase: 0,
    };
    latest.vendors[0]!.retaseTotal = 0;
    latest.vendors[0]!.hourly[0]!.retase = 0;
    latest.reportRetaseTotal = 0;
    vi.spyOn(master, "findEquipmentById").mockResolvedValue(null);
    await expect(service.confirm(actor, id, 2, latest)).rejects.toMatchObject({
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({ code: "DT_EQUIPMENT_MISMATCH" }),
        ]),
      },
    });
    expect(repo.confirm).not.toHaveBeenCalled();
  });

  it("validates image bytes, MIME and pixel limits; preserves exact original hash", async () => {
    const { service, repo } = setup();
    const bytes = await sharp({
      create: { width: 20, height: 20, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    await service.upload(actor, id, "../../foto.jpg", "image/jpeg", bytes);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes,
        mimeType: "image/jpeg",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    await expect(
      service.upload(
        actor,
        id,
        "fake.jpg",
        "image/jpeg",
        Buffer.from("not image"),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_IMAGE" });
    await expect(
      service.upload(actor, id, "fake.png", "image/png", bytes),
    ).rejects.toMatchObject({ code: "INVALID_REPORT_IMAGE" });
    await expect(
      service.upload(
        actor,
        id,
        "large.jpg",
        "image/jpeg",
        Buffer.alloc(MAX_REPORT_IMAGE_BYTES + 1),
      ),
    ).rejects.toMatchObject({ code: "IMAGE_TOO_LARGE", statusCode: 413 });
  });
  it("blocks vendor users and out-of-scope operators before storage", async () => {
    const { service, repo } = setup();
    await expect(
      service.get({ ...actor, role: "VENDOR" }, id),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      service.get({ ...actor, role: "CRUSHER_OPERATOR" }, id),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repo.create).not.toHaveBeenCalled();
  });
  it("saves corrections without writing canonical events", async () => {
    const { service, repo } = setup();
    await service.save(actor, id, 2, draft);
    expect(repo.saveDraft).toHaveBeenCalled();
    expect(repo.confirm).not.toHaveBeenCalled();
  });
  it("allows only supervisors to delete unconfirmed imports and retains confirmed reports", async () => {
    const { service, repo, item } = setup();
    await expect(service.remove(actor, id)).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.deleteUnconfirmed).not.toHaveBeenCalled();
    const supervisor = { ...actor, role: "SUPERVISOR_ADMIN" } as AuthPrincipal;
    await expect(service.remove(supervisor, id)).resolves.toEqual({
      deletedId: id,
    });
    expect(repo.deleteUnconfirmed).toHaveBeenCalledWith(id, supervisor);
    item.status = "CONFIRMED";
    item.reportId = id;
    await expect(service.remove(supervisor, id)).rejects.toMatchObject({
      statusCode: 409,
      code: "REPORT_RETENTION_REQUIRED",
    });
    expect(repo.deleteUnconfirmed).toHaveBeenCalledTimes(1);
  });
  it("fails closed when the database retention guard rejects deletion", async () => {
    const { service, repo } = setup();
    vi.mocked(repo.deleteUnconfirmed).mockResolvedValue(false);
    await expect(
      service.remove(
        { ...actor, role: "SUPERVISOR_ADMIN" } as AuthPrincipal,
        id,
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "REPORT_RETENTION_REQUIRED",
    });
  });
  it("rejects stale edits and stale confirmations", async () => {
    const { service } = setup();
    await expect(service.save(actor, id, 1, draft)).rejects.toMatchObject({
      code: "IMPORT_STALE",
    });
    await expect(service.confirm(actor, id, 1)).rejects.toMatchObject({
      code: "IMPORT_STALE",
    });
  });
  it("rechecks effective assignment under lock and confirms idempotently", async () => {
    const { service, repo } = setup();
    await service.confirm(actor, id, 2);
    await service.confirm(actor, id, 2);
    expect(repo.confirm).toHaveBeenCalledTimes(1);
    expect(repo.lockAssignments).toHaveBeenCalledWith([id]);
  });
  it("blocks mismatched DT, missing reviews and unauthorized final confirm", async () => {
    const { service, repo, item } = setup();
    item.draft!.vendors[0]!.vehicles[0]!.dtNo = "25";
    await expect(service.confirm(actor, id, 2)).rejects.toMatchObject({
      code: "REPORT_REVIEW_REQUIRED",
    });
    expect(repo.confirm).not.toHaveBeenCalled();
    item.draft!.vendors[0]!.vehicles[0]!.reviewed = false;
    await expect(service.confirm(actor, id, 2)).rejects.toMatchObject({
      code: "REPORT_REVIEW_REQUIRED",
    });
    await expect(
      service.confirm(
        { ...actor, role: "CRUSHER_OPERATOR", crusherIds: [id] },
        id,
        2,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it("does not reparse and overwrite corrected/confirmed evidence", async () => {
    const { service } = setup();
    await expect(service.reparse(actor, id)).rejects.toMatchObject({
      code: "REPARSE_NOT_ALLOWED",
    });
  });
  it("registers JSON schemas with Fastify and guards every endpoint", async () => {
    const { service, item } = setup(),
      app = Fastify();
    app.decorate("auth", {
      requireRoles:
        (...roles: string[]) =>
        async (request: any, reply: any) => {
          if (!roles.includes(request.headers["x-role"]))
            return reply.code(403).send({ ok: false });
          request.principal = {
            ...actor,
            role: request.headers["x-role"],
          };
        },
    } as any);
    await registerCrusherReportRoutes(app, service);
    await app.ready();
    for (const url of [
      `/crusher-report-imports?crusherId=${id}`,
      `/crusher-report-imports/${id}`,
      `/crusher-report-imports/${id}/image`,
      `/crusher-report-imports/${id}/assignments?operationDate=2026-08-18&shiftCode=SHIFT_2`,
    ])
      expect(
        (
          await app.inject({
            method: "GET",
            url,
            headers: { "x-role": "VENDOR" },
          })
        ).statusCode,
      ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/crusher-report-imports/${id}/confirm`,
          headers: { "x-role": "CRUSHER_OPERATOR" },
          payload: { revision: 2, reviewed: true },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/crusher-report-imports/${id}`,
          headers: { "x-role": "QC_ANALYST" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/crusher-report-imports/${id}`,
          headers: { "x-role": "SUPERVISOR_ADMIN" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/crusher-report-imports/${id}/draft`,
          headers: { "x-role": "QC_ANALYST" },
          payload: { revision: 2, draft },
        })
      ).statusCode,
    ).toBe(200);
    const upload = vi.spyOn(service, "upload").mockResolvedValue({
      ...item,
      status: "QUEUED",
    });
    const process = vi.spyOn(service, "process").mockResolvedValue(item);
    const boundary = "----orevision-inline-test";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="report.jpg"\r\nContent-Type: image/jpeg\r\n\r\nfake\r\n--${boundary}--\r\n`,
    );
    const response = await app.inject({
      method: "POST",
      url: `/crusher-report-imports?crusherId=${id}`,
      headers: {
        "x-role": "QC_ANALYST",
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(upload).toHaveBeenCalledWith(
      actor,
      id,
      "report.jpg",
      "image/jpeg",
      Buffer.from("fake"),
    );
    expect(process).toHaveBeenCalledWith(actor, id);
    await app.close();
  });
});
