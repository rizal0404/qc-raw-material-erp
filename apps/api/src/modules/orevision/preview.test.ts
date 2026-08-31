import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { OreVisionDiagnosticsSchema } from "@qc/contracts";
import type { AuthPrincipal, MasterRepository, CrusherReportRepository, ClayPhotoReportRepository } from "@qc/domain";
import { createCrusherReportService } from "../crusher-report/service";
import { createClayPhotoReportService } from "../clay-photo-report/service";
import { registerCrusherReportRoutes } from "../crusher-report/routes";
import { registerClayPhotoReportRoutes } from "../clay-photo-report/routes";
import { OreVisionExtractionError } from "./diagnostics";

const id = "10000000-0000-4000-8000-000000000001";
const actor = { userId: id, role: "QC_ANALYST", crusherIds: [] } as unknown as AuthPrincipal;
function snapshot() {
  return OreVisionDiagnosticsSchema.parse({
    version: 1, capturedAt: "2026-08-31T00:00:00.000Z",
    input: { provider: "openai", model: "test", systemPrompt: "", prompt: "JSON",
      temperature: null, topP: null, maxOutputTokens: 16000,
      image: { width: 10, height: 10, bytes: 100, mimeType: "image/jpeg" },
      shiftHours: { SHIFT_2: [15, 16, 17, 18, 19, 20, 21, 22] } },
    rawOutput: "original output", parsedOutput: { original: true },
    normalizedDraft: { original: true }, error: null,
  });
}
function setup(material: "LS" | "CL", status = "READY") {
  const item = { id, crusherId: id, status, revision: 4, draft: { reviewed: true }, diagnostics: snapshot() };
  const repository = {
    get: vi.fn(async () => item),
    file: vi.fn(async () => ({ bytes: Buffer.from("original image"), mimeType: "image/jpeg" })),
    claim: vi.fn(async () => ({ id, leaseToken: "lease", bytes: Buffer.from("original image") })),
    finish: vi.fn(), fail: vi.fn(), saveDraft: vi.fn(), confirm: vi.fn(), requeue: vi.fn(),
    transaction: vi.fn(),
  };
  const master = {
    findCrusherById: vi.fn(async () => ({ id, active: true, materialKind: material })),
    listShifts: vi.fn(async () => [{ code: "SHIFT_2", startTime: "15:30", endTime: "22:30", crossesMidnight: false }]),
  } as unknown as MasterRepository;
  const extract = vi.fn().mockResolvedValue({
    aligned: Buffer.from("aligned"),
    result: { draft: { attendance: {}, columns: [] }, diagnostics: snapshot() },
  });
  const service = material === "LS"
    ? createCrusherReportService(repository as unknown as CrusherReportRepository, master, { extract })
    : createClayPhotoReportService(repository as unknown as ClayPhotoReportRepository, master, { extract });
  return { item, repository, extract, service };
}
function expectNoWrites(repository: ReturnType<typeof setup>["repository"]) {
  for (const key of ["claim", "finish", "fail", "saveDraft", "confirm", "requeue", "transaction"] as const)
    expect(repository[key], key).not.toHaveBeenCalled();
}

describe.each(["LS", "CL"] as const)("%s parser preview", (material) => {
  it.each(["READY", "NEEDS_REVIEW", "FAILED", "CONFIRMED"])(
    "returns an experiment on %s without mutating stored evidence/review",
    async (status) => {
      const { item, service, repository, extract } = setup(material, status);
      const before = structuredClone(item);
      const result = await service.preview(actor, id);
      expect(result.rawOutput).toBe("original output");
      expect(repository.file).toHaveBeenCalledWith(id, false);
      expect(extract).toHaveBeenCalledWith(Buffer.from("original image"), expect.objectContaining({ SHIFT_2: expect.any(Array) }));
      expect(item).toEqual(before);
      expectNoWrites(repository);
    },
  );
  it.each(["QUEUED", "PROCESSING"])("does not race a %s import", async (status) => {
    const { service, repository, extract } = setup(material, status);
    await expect(service.preview(actor, id)).rejects.toMatchObject({ statusCode: 409 });
    expect(extract).not.toHaveBeenCalled();
    expectNoWrites(repository);
  });
  it("checks the actor and crusher scope before reading/sending the photo", async () => {
    const { service, repository, extract } = setup(material);
    for (const role of ["VENDOR", "CRUSHER_OPERATOR"] as const)
      await expect(service.preview({ ...actor, role, crusherIds: [] }, id)).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.file).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    expectNoWrites(repository);
  });
  it("returns captured failure evidence without persisting the experiment", async () => {
    const { service, repository, extract } = setup(material);
    const evidence = snapshot();
    evidence.error = { code: "INVALID_JSON", message: "Invalid JSON" };
    extract.mockRejectedValue(new OreVisionExtractionError(evidence, 502, "INVALID_JSON", "Invalid JSON"));
    expect(await service.preview(actor, id)).toEqual(evidence);
    expectNoWrites(repository);
  });
  it("persists captured failures only in the normal import workflow", async () => {
    const { service, repository, extract } = setup(material, "QUEUED");
    const evidence = snapshot();
    evidence.error = { code: "INVALID_JSON", message: "Invalid JSON" };
    extract.mockRejectedValue(new OreVisionExtractionError(evidence, 502, "INVALID_JSON", "Invalid JSON"));
    await service.process(actor, id);
    expect(repository.fail).toHaveBeenCalledWith(id, "lease", "Invalid JSON", evidence);
    expect(repository.finish).not.toHaveBeenCalled();
  });
  it("blocks a duplicate preview and releases the guard after failure", async () => {
    const { service, repository, extract } = setup(material);
    let reject!: (reason: Error) => void;
    extract.mockImplementationOnce(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    const first = service.preview(actor, id).catch((error: unknown) => error);
    await vi.waitFor(() => expect(extract).toHaveBeenCalledOnce());
    await expect(service.preview(actor, id)).rejects.toMatchObject({ statusCode: 429 });
    reject(new Error("private upstream details"));
    expect(await first).toMatchObject({ statusCode: 502 });
    expect(JSON.stringify(await first)).not.toContain("private upstream details");
    await expect(service.preview(actor, id)).resolves.toMatchObject({ rawOutput: "original output" });
    expectNoWrites(repository);
  });
  it("requires explicit HTTP consent and authorized role before preview", async () => {
    const { service } = setup(material);
    const preview = vi.spyOn(service, "preview").mockResolvedValue(snapshot());
    const app = Fastify();
    app.decorate("auth", {
      requireRoles: (...roles: string[]) => async (request: any, reply: any) => {
        if (!roles.includes(request.headers["x-role"])) return reply.code(403).send({ ok: false });
        request.principal = actor;
      },
    } as any);
    try {
      if (material === "LS") await registerCrusherReportRoutes(app, service as ReturnType<typeof createCrusherReportService>);
      else await registerClayPhotoReportRoutes(app, service as ReturnType<typeof createClayPhotoReportService>);
      const url = "/" + (material === "LS" ? "crusher" : "clay") + "-report-imports/" + id + "/preview";
      for (const payload of [{}, { acknowledgeExternalVlm: false }])
        expect((await app.inject({ method: "POST", url, headers: { "x-role": "QC_ANALYST" }, payload })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url, headers: { "x-role": "VENDOR" }, payload: { acknowledgeExternalVlm: true } })).statusCode).toBe(403);
      expect(preview).not.toHaveBeenCalled();
      const response = await app.inject({ method: "POST", url, headers: { "x-role": "QC_ANALYST" }, payload: { acknowledgeExternalVlm: true } });
      expect(response.statusCode).toBe(200);
      expect(response.headers["cache-control"]).toBe("private, no-store");
      expect(response.json()).toEqual({ ok: true, diagnostics: snapshot() });
      expect(preview).toHaveBeenCalledExactlyOnceWith(actor, id);
    } finally {
      await app.close();
    }
  });
});
