import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  AuthPrincipal,
  CrusherReportRepository,
  MasterRepository,
  EquipmentRecord,
} from "@qc/domain";
import { normalizeReportDt, validateCrusherReport } from "@qc/domain";
import { reportShiftHours } from "@qc/domain";
import type { CrusherReportDraft, CrusherReportImport } from "@qc/contracts";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { extractReport } from "../orevision/extractor";
import { OreVisionExtractionError } from "../orevision/diagnostics";

export const MAX_REPORT_IMAGE_BYTES = 4 * 1024 * 1024;
export function createCrusherReportService(
  repository: CrusherReportRepository,
  master: MasterRepository,
  options: { extract?: typeof extractReport } = {},
) {
  const runExtraction = options.extract ?? extractReport;
  const previews = new Set<string>();
  async function scope(actor: AuthPrincipal, crusherId: string) {
    if (
      !["CRUSHER_OPERATOR", "QC_ANALYST", "SUPERVISOR_ADMIN"].includes(
        actor.role,
      )
    )
      throw forbidden();
    if (
      actor.role === "CRUSHER_OPERATOR" &&
      !actor.crusherIds.includes(crusherId)
    )
      throw forbidden("Crusher di luar scope operator.");
    const crusher = await master.findCrusherById(crusherId);
    if (!crusher || !crusher.active || crusher.materialKind !== "LS")
      throw new AppError(
        400,
        "LIMESTONE_CRUSHER_REQUIRED",
        "Pilih crusher Limestone yang aktif.",
      );
  }
  async function get(actor: AuthPrincipal, id: string, repo = repository) {
    const item = await repo.get(id);
    if (!item) throw notFound("Import laporan tidak ditemukan.");
    await scope(actor, item.crusherId);
    return item;
  }
  function editable(item: CrusherReportImport, revision: number) {
    if (item.revision !== revision)
      throw new AppError(
        409,
        "IMPORT_STALE",
        "Draft berubah di sesi lain. Muat ulang sebelum menyimpan.",
      );
    if (!["NEEDS_REVIEW", "READY"].includes(item.status))
      throw new AppError(
        409,
        "IMPORT_NOT_EDITABLE",
        "Tunggu parser selesai; laporan confirmed tidak dapat diubah.",
      );
  }
  async function validate(
    repo: CrusherReportRepository,
    item: CrusherReportImport,
    draft: CrusherReportDraft,
    lock = false,
  ) {
    const matchesEquipment = (
      aa: EquipmentRecord | null,
      vendorId: string | null,
      dtNo: string,
    ) =>
      aa?.active &&
      aa.type === "AA" &&
      aa.vendorId === vendorId &&
      aa.materialKinds.includes("LS") &&
      [aa.unitNo, ...aa.aliases].some(
        (x) => normalizeReportDt(x) === normalizeReportDt(dtNo),
      );
    const shift = (await master.listShifts(true)).find(
      (x) => x.code === draft.shiftCode,
    );
    const issues = validateCrusherReport(draft, shift);
    const resolved: Parameters<CrusherReportRepository["confirm"]>[0]["rows"] =
      [];
    if (lock)
      await repo.lockAssignments(
        draft.vendors.flatMap((v) =>
          v.vehicles.flatMap((r) =>
            r.assignmentAaId ? [r.assignmentAaId] : [],
          ),
        ),
      );
    for (const [vi, v] of draft.vendors.entries()) {
      if (v.vendorId) {
        const vendor = await master.findVendorById(v.vendorId);
        if (!vendor?.active || !vendor.materialKinds.includes("LS"))
          issues.push({
            code: "VENDOR_NOT_ACTIVE",
            path: `vendors.${vi}.vendorId`,
            severity: "BLOCKING",
            message: "Vendor tidak aktif untuk Limestone.",
          });
      }
      for (const [ri, row] of v.vehicles.entries()) {
        const equipment = row.equipmentId
          ? await master.findEquipmentById(row.equipmentId)
          : null;
        if (
          row.equipmentId &&
          !matchesEquipment(equipment, v.vendorId, row.dtNo)
        )
          issues.push({
            code: "DT_EQUIPMENT_MISMATCH",
            path: `vendors.${vi}.vehicles.${ri}.equipmentId`,
            severity: "BLOCKING",
            message:
              "DT harus cocok dengan equipment AA aktif milik vendor ini untuk Limestone.",
          });
        if (!row.assignmentAaId || !row.retase) continue;
        const a = await repo.resolve(row.assignmentAaId, item.crusherId);
        const aa = a
          ? equipment?.id === a.aaId
            ? equipment
            : await master.findEquipmentById(a.aaId)
          : null;
        if (
          !a ||
          a.operationDate !== draft.reportDate ||
          a.shiftCode !== draft.shiftCode ||
          a.vendorId !== v.vendorId ||
          a.materialKind !== "LS" ||
          !matchesEquipment(aa, v.vendorId, row.dtNo) ||
          (row.equipmentId && row.equipmentId !== a.aaId)
        ) {
          issues.push({
            code: "DT_VENDOR_ASSIGNMENT_MISMATCH",
            path: `vendors.${vi}.vehicles.${ri}.assignmentAaId`,
            severity: "BLOCKING",
            message:
              "Assignment harus efektif, sesuai vendor/DT/tanggal/shift/crusher. Periksa laporan vendor dan mapping AM.",
          });
          continue;
        }
        resolved.push({
          vendorIndex: vi,
          rowIndex: ri,
          resolution: a,
          retase: row.retase,
        });
      }
    }
    return { issues, shift, resolved };
  }
  async function processImport(actor: AuthPrincipal, id: string) {
    const current = await get(actor, id);
    if (!["QUEUED", "PROCESSING"].includes(current.status)) return current;
    const job = await repository.claim(id);
    // Another concurrent request owns the lease. Its result remains observable
    // through the normal authenticated GET/polling endpoint.
    if (!job) return (await repository.get(id))!;
    try {
      const shifts = await master.listShifts(true);
      const shiftHours = Object.fromEntries(
        shifts.map((shift) => [shift.code, reportShiftHours(shift)]),
      );
      const output = await runExtraction(job.bytes, shiftHours);
      await repository.finish(
        job.id,
        job.leaseToken,
        output.result,
        output.aligned,
      );
    } catch (error) {
      await repository.fail(
        job.id,
        job.leaseToken,
        error instanceof AppError
          ? error.message
          : "OreVision gagal di API. Periksa konfigurasi engine lalu ulangi ekstraksi.",
        error instanceof OreVisionExtractionError ? error.diagnostics : undefined,
      );
    }
    return (await repository.get(id))!;
  }
  return {
    get,
    process: processImport,
    async preview(actor: AuthPrincipal, id: string) {
      const current = await get(actor, id);
      if (["QUEUED", "PROCESSING"].includes(current.status))
        throw new AppError(409, "IMPORT_BUSY", "Tunggu ekstraksi aktif selesai sebelum menguji parser.");
      if (previews.has(id))
        throw new AppError(429, "OREVISION_PREVIEW_BUSY", "Uji parser untuk foto ini sedang berjalan.");
      previews.add(id);
      try {
        const source = await repository.file(id, false);
        if (!source) throw notFound("Gambar belum tersedia.");
        const shifts = await master.listShifts(true);
        const shiftHours = Object.fromEntries(
          shifts.map((shift) => [shift.code, reportShiftHours(shift)]),
        );
        // A tuning preview never claims/requeues a job or changes review data.
        const output = await runExtraction(source.bytes, shiftHours);
        if (!output.result.diagnostics)
          throw new AppError(502, "OREVISION_DIAGNOSTICS_UNAVAILABLE", "Parser tidak menyediakan diagnostik untuk uji ini.");
        return output.result.diagnostics;
      } catch (error) {
        if (error instanceof OreVisionExtractionError) return error.diagnostics;
        if (error instanceof AppError) throw error;
        throw new AppError(502, "OREVISION_PREVIEW_FAILED", "Uji parser gagal. Periksa konfigurasi engine lalu ulangi.");
      } finally {
        previews.delete(id);
      }
    },
    async list(actor: AuthPrincipal, crusherId: string) {
      await scope(actor, crusherId);
      return repository.list(crusherId);
    },
    async upload(
      actor: AuthPrincipal,
      crusherId: string,
      fileName: string,
      mimeType: string,
      bytes: Buffer,
    ) {
      await scope(actor, crusherId);
      if (bytes.length === 0 || bytes.length > MAX_REPORT_IMAGE_BYTES)
        throw new AppError(
          413,
          "IMAGE_TOO_LARGE",
          "Ukuran gambar maksimum 4 MiB agar kompatibel dengan deployment Vercel.",
        );
      try {
        const decoder = sharp(bytes, {
          limitInputPixels: 24_000_000,
          failOn: "warning",
          animated: false,
        });
        const metadata = await decoder.metadata();
        if (
          !["jpeg", "png", "webp"].includes(metadata.format ?? "") ||
          mimeType !== `image/${metadata.format}` ||
          (metadata.pages ?? 1) > 1
        )
          throw new Error("Unsupported image");
        await decoder.resize(1, 1).raw().toBuffer();
      } catch {
        throw new AppError(
          400,
          "INVALID_REPORT_IMAGE",
          "Gambar harus JPEG, PNG, atau WebP valid, satu halaman, maksimum 24 megapixel.",
        );
      }
      const id = await repository.create({
        crusherId,
        fileName: fileName.replace(/[\\/\x00-\x1f]/g, "_").slice(0, 200),
        mimeType,
        bytes,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        actorId: actor.userId,
      });
      return get(actor, id);
    },
    async file(actor: AuthPrincipal, id: string, aligned: boolean) {
      await get(actor, id);
      const file = await repository.file(id, aligned);
      if (!file) throw notFound("Gambar belum tersedia.");
      return file;
    },
    async remove(actor: AuthPrincipal, id: string) {
      if (actor.role !== "SUPERVISOR_ADMIN")
        throw forbidden(
          "Hanya supervisor/admin yang dapat menghapus laporan foto.",
        );
      return repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        if (item.status === "CONFIRMED" || item.reportId)
          throw new AppError(
            409,
            "REPORT_RETENTION_REQUIRED",
            "Laporan yang sudah diverifikasi dan dikirim ke rekonsiliasi/workbench wajib tetap disimpan.",
          );
        if (!(await repo.deleteUnconfirmed(id, actor)))
          throw new AppError(
            409,
            "REPORT_RETENTION_REQUIRED",
            "Laporan tidak dapat dihapus karena sudah menjadi data terverifikasi.",
          );
        return { deletedId: id };
      });
    },
    async candidates(
      actor: AuthPrincipal,
      id: string,
      input: {
        operationDate: string;
        shiftCode: "SHIFT_1" | "SHIFT_2" | "SHIFT_3";
      },
    ) {
      const item = await get(actor, id);
      return repository.candidates({ ...input, crusherId: item.crusherId });
    },
    async save(
      actor: AuthPrincipal,
      id: string,
      revision: number,
      draft: CrusherReportDraft,
    ) {
      return repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        editable(item, revision);
        const result = await validate(repo, item, draft);
        await repo.saveDraft(id, draft, result.issues, actor);
        return (await repo.get(id))!;
      });
    },
    async confirm(
      actor: AuthPrincipal,
      id: string,
      revision: number,
      draft?: CrusherReportDraft,
    ) {
      if (!["QC_ANALYST", "SUPERVISOR_ADMIN"].includes(actor.role))
        throw forbidden(
          "Konfirmasi retase foto memerlukan QC atau supervisor.",
        );
      return repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        if (item.status === "CONFIRMED") return item;
        editable(item, revision);
        const reviewedDraft = draft ?? item.draft;
        if (!reviewedDraft)
          throw new AppError(409, "DRAFT_MISSING", "Draft belum tersedia.");
        const result = await validate(repo, item, reviewedDraft, true);
        if (result.issues.some((x) => x.severity === "BLOCKING"))
          throw new AppError(
            409,
            "REPORT_REVIEW_REQUIRED",
            "Selesaikan masalah blocking sebelum konfirmasi.",
            { issues: result.issues },
          );
        // Corrections and canonical events commit together, or both roll back.
        if (draft) await repo.saveDraft(id, draft, result.issues, actor);
        await repo.confirm({
          item: { ...item, draft: reviewedDraft },
          actor,
          shiftStart: result.shift!.startTime,
          rows: result.resolved,
        });
        return (await repo.get(id))!;
      });
    },
    async reparse(actor: AuthPrincipal, id: string) {
      await repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        if (item.status !== "FAILED")
          throw new AppError(
            409,
            "REPARSE_NOT_ALLOWED",
            "Ulang parser hanya untuk job gagal; draft review tidak ditimpa.",
          );
        await repo.requeue(id);
      });
      return processImport(actor, id);
    },
  };
}
export type CrusherReportService = ReturnType<
  typeof createCrusherReportService
>;
