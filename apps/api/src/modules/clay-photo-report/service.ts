import { createHash } from "node:crypto";
import sharp from "sharp";
import type {
  AuthPrincipal,
  ClayPhotoReportRepository,
  MasterRepository,
} from "@qc/domain";
import { clayReportShiftHours } from "@qc/domain";
import type {
  ClayPhotoReportDraft,
  ClayPhotoReportImport,
  CrusherReportIssue,
} from "@qc/contracts";
import { AppError, forbidden, notFound } from "../../lib/errors";
import { extractClayReport } from "../orevision/clay-extractor";
import { OreVisionExtractionError } from "../orevision/diagnostics";

export const MAX_CLAY_REPORT_IMAGE_BYTES = 4 * 1024 * 1024;

function compactLayoutDraft(
  draft: ClayPhotoReportDraft,
): ClayPhotoReportDraft {
  const normalized = structuredClone(draft);
  normalized.attendance = {
    present: null,
    sick: null,
    overtime: null,
    permission: null,
    leave: null,
  };
  for (const column of normalized.columns) {
    column.headerSecondary = null;
    column.pileId = null;
    column.totalRetase = null;
    if (
      column.inputMode === "MANUAL" &&
      !column.vendorId &&
      !column.sourceId
    )
      column.sourceNameSnapshot = column.headerPrimary;
  }
  return normalized;
}

export function createClayPhotoReportService(
  repository: ClayPhotoReportRepository,
  master: MasterRepository,
  options: { extract?: typeof extractClayReport } = {},
) {
  const runExtraction = options.extract ?? extractClayReport;
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
    if (!crusher || !crusher.active || crusher.materialKind !== "CL")
      throw new AppError(
        400,
        "CLAY_CRUSHER_REQUIRED",
        "Pilih crusher Clay yang aktif.",
      );
  }

  async function get(
    actor: AuthPrincipal,
    id: string,
    repo = repository,
  ) {
    const item = await repo.get(id);
    if (!item) throw notFound("Import laporan foto Clay tidak ditemukan.");
    await scope(actor, item.crusherId);
    return item;
  }

  function editable(item: ClayPhotoReportImport, revision: number) {
    if (item.revision !== revision)
      throw new AppError(
        409,
        "CLAY_IMPORT_STALE",
        "Draft berubah di sesi lain. Muat ulang sebelum menyimpan.",
      );
    if (!["NEEDS_REVIEW", "READY"].includes(item.status))
      throw new AppError(
        409,
        "CLAY_IMPORT_NOT_EDITABLE",
        "Tunggu parser selesai; laporan terkonfirmasi tidak dapat diubah.",
      );
  }

  async function validate(draft: ClayPhotoReportDraft) {
    const issues: CrusherReportIssue[] = [];
    if (!draft.operationDate)
      issues.push({
        code: "CLAY_DATE_REQUIRED",
        path: "operationDate",
        severity: "WARNING",
        message: "Tanggal laporan wajib diverifikasi.",
      });
    if (!draft.shiftCode)
      issues.push({
        code: "CLAY_SHIFT_REQUIRED",
        path: "shiftCode",
        severity: "WARNING",
        message: "Shift laporan wajib diverifikasi.",
      });
    const shift = draft.shiftCode
      ? (await master.listShifts(true)).find(
          (candidate) => candidate.code === draft.shiftCode,
        )
      : null;
    if (draft.shiftCode && !shift)
      issues.push({
        code: "CLAY_SHIFT_INVALID",
        path: "shiftCode",
        severity: "WARNING",
        message: "Shift tidak tersedia pada master aktif.",
      });
    if (shift) {
      const expected = clayReportShiftHours(shift);
      if (
        draft.hours.length !== expected.length ||
        draft.hours.some((hour, index) => hour !== expected[index])
      )
        issues.push({
          code: "CLAY_HOURS_MISMATCH",
          path: "hours",
          severity: "BLOCKING",
          message:
            "Baris jam harus sesuai konfigurasi shift. Pilih shift yang benar lalu periksa matriks.",
        });
    }

    const orders = new Set<number>();
    let totalRetase = 0;
    for (const [columnIndex, column] of draft.columns.entries()) {
      const path = `columns.${columnIndex}`;
      if (orders.has(column.displayOrder))
        issues.push({
          code: "CLAY_COLUMN_ORDER_DUPLICATE",
          path: `${path}.displayOrder`,
          severity: "BLOCKING",
          message: "Urutan kolom harus unik.",
        });
      orders.add(column.displayOrder);
      if (!column.reviewed)
        issues.push({
          code: "CLAY_COLUMN_REVIEW_REQUIRED",
          path: `${path}.reviewed`,
          severity: "BLOCKING",
          message: "Periksa header dan seluruh turus kolom, lalu tandai terverifikasi.",
        });
      const hourSet = new Set<number>();
      for (const [hourIndex, cell] of column.hourly.entries()) {
        if (hourSet.has(cell.hour))
          issues.push({
            code: "CLAY_HOUR_DUPLICATE",
            path: `${path}.hourly.${hourIndex}.hour`,
            severity: "BLOCKING",
            message: "Jam yang sama muncul lebih dari sekali pada satu kolom.",
          });
        hourSet.add(cell.hour);
        if (!draft.hours.includes(cell.hour))
          issues.push({
            code: "CLAY_HOUR_OUTSIDE_MATRIX",
            path: `${path}.hourly.${hourIndex}.hour`,
            severity: "BLOCKING",
            message: "Jam sel tidak termasuk baris jam laporan.",
          });
      }
      const calculated = column.hourly.reduce(
        (sum, cell) => sum + (cell.retase ?? 0),
        0,
      );
      totalRetase += calculated;
      if (!calculated)
        issues.push({
          code: "CLAY_VENDOR_RETASE_REQUIRED",
          path: `${path}.hourly`,
          severity: "BLOCKING",
          message:
            "Vendor/source ini tidak memiliki retase. Isi matriks atau hapus kolom tersebut.",
        });
      if (column.vendorId) {
        const vendor = await master.findVendorById(column.vendorId);
        if (!vendor?.active || !vendor.materialKinds.includes("CL"))
          issues.push({
            code: "CLAY_VENDOR_INVALID",
            path: `${path}.vendorId`,
            severity: "BLOCKING",
            message: "Vendor bukan master Clay yang aktif.",
          });
      }
      if (column.sourceId) {
        const source = await master.findSourceById(column.sourceId);
        if (!source?.active || source.materialKind !== "CL")
          issues.push({
            code: "CLAY_SOURCE_INVALID",
            path: `${path}.sourceId`,
            severity: "BLOCKING",
            message: "Source bukan master Clay yang aktif.",
          });
      }
      if (column.pileId) {
        const pile = await master.findPileById(column.pileId);
        if (!pile?.active || pile.materialKind !== "CL")
          issues.push({
            code: "CLAY_PILE_INVALID",
            path: `${path}.pileId`,
            severity: "BLOCKING",
            message: "Pile bukan master Clay yang aktif.",
          });
      }
    }
    if (!totalRetase)
      issues.push({
        code: "CLAY_RETASE_REQUIRED",
        path: "columns",
        severity: "BLOCKING",
        message: "Minimum satu retase wajib terverifikasi sebelum konfirmasi.",
      });
    for (const [logIndex, log] of draft.operationLogs.entries())
      if ((log.startTime === null) !== (log.endTime === null))
        issues.push({
          code: "CLAY_LOG_TIME_PAIR_REQUIRED",
          path: `operationLogs.${logIndex}`,
          severity: "WARNING",
          message:
            "Jam gangguan tidak lengkap; catatan akan disimpan tanpa waktu mulai/selesai.",
        });
    return issues;
  }

  async function processImport(actor: AuthPrincipal, id: string) {
    const current = await get(actor, id);
    if (!["QUEUED", "PROCESSING"].includes(current.status)) return current;
    const job = await repository.claim(id);
    if (!job) return (await repository.get(id))!;
    try {
      const shifts = await master.listShifts(true);
      const shiftHours = Object.fromEntries(
        shifts.map((shift) => [shift.code, clayReportShiftHours(shift)]),
      );
      const output = await runExtraction(job.bytes, shiftHours);
      output.result.draft = compactLayoutDraft(output.result.draft);
      if (output.result.diagnostics)
        output.result.diagnostics.normalizedDraft = structuredClone(output.result.draft);
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
          : "Parser VLM Clay gagal di API. Periksa konfigurasi engine lalu ulangi ekstraksi.",
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
        throw new AppError(409, "CLAY_IMPORT_BUSY", "Tunggu ekstraksi aktif selesai sebelum menguji parser.");
      if (previews.has(id))
        throw new AppError(429, "CLAY_PREVIEW_BUSY", "Uji parser untuk foto ini sedang berjalan.");
      previews.add(id);
      try {
        const source = await repository.file(id, false);
        if (!source) throw notFound("Gambar belum tersedia.");
        const shifts = await master.listShifts(true);
        const shiftHours = Object.fromEntries(
          shifts.map((shift) => [shift.code, clayReportShiftHours(shift)]),
        );
        const output = await runExtraction(source.bytes, shiftHours);
        if (!output.result.diagnostics)
          throw new AppError(502, "OREVISION_DIAGNOSTICS_UNAVAILABLE", "Parser tidak menyediakan diagnostik untuk uji ini.");
        output.result.diagnostics.normalizedDraft = compactLayoutDraft(output.result.draft);
        return output.result.diagnostics;
      } catch (error) {
        if (error instanceof OreVisionExtractionError) return error.diagnostics;
        if (error instanceof AppError) throw error;
        throw new AppError(502, "CLAY_PREVIEW_FAILED", "Uji parser Clay gagal. Periksa konfigurasi engine lalu ulangi.");
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
      if (!bytes.length || bytes.length > MAX_CLAY_REPORT_IMAGE_BYTES)
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
          "INVALID_CLAY_REPORT_IMAGE",
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
      const source = await repository.file(id, aligned);
      if (!source) throw notFound("Gambar belum tersedia.");
      return source;
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
            "CLAY_REPORT_RETENTION_REQUIRED",
            "Laporan yang sudah dikirim ke Clay Mining Workbench wajib tetap disimpan.",
          );
        if (!(await repo.deleteUnconfirmed(id, actor)))
          throw new AppError(
            409,
            "CLAY_REPORT_RETENTION_REQUIRED",
            "Laporan tidak dapat dihapus karena sudah menjadi data terverifikasi.",
          );
        return { deletedId: id };
      });
    },
    async save(
      actor: AuthPrincipal,
      id: string,
      revision: number,
      draft: ClayPhotoReportDraft,
    ) {
      return repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        editable(item, revision);
        const normalized = compactLayoutDraft(draft);
        const issues = await validate(normalized);
        await repo.saveDraft(id, normalized, issues, actor);
        return (await repo.get(id))!;
      });
    },
    async confirm(
      actor: AuthPrincipal,
      id: string,
      revision: number,
      draft?: ClayPhotoReportDraft,
    ) {
      if (!["QC_ANALYST", "SUPERVISOR_ADMIN"].includes(actor.role))
        throw forbidden(
          "Konfirmasi laporan foto Clay memerlukan QC atau supervisor.",
        );
      return repository.transaction(async (repo) => {
        await repo.lock(id);
        const item = await get(actor, id, repo);
        if (item.status === "CONFIRMED") return item;
        editable(item, revision);
        const reviewedDraftSource = draft ?? item.draft;
        const reviewedDraft = reviewedDraftSource
          ? compactLayoutDraft(reviewedDraftSource)
          : null;
        if (!reviewedDraft)
          throw new AppError(409, "DRAFT_MISSING", "Draft belum tersedia.");
        if (!reviewedDraft.operationDate || !reviewedDraft.shiftCode)
          throw new AppError(
            409,
            "CLAY_REPORT_CONTEXT_REQUIRED",
            "Tanggal dan shift wajib dipilih sebelum konfirmasi.",
          );
        const issues = await validate(reviewedDraft);
        if (issues.some((issue) => issue.severity === "BLOCKING"))
          throw new AppError(
            409,
            "CLAY_REPORT_REVIEW_REQUIRED",
            "Selesaikan masalah blocking sebelum konfirmasi.",
            { issues },
          );
        await repo.lockContext({
          crusherId: item.crusherId,
          operationDate: reviewedDraft.operationDate!,
          shiftCode: reviewedDraft.shiftCode!,
        });
        const target = await repo.target({
          crusherId: item.crusherId,
          operationDate: reviewedDraft.operationDate!,
          shiftCode: reviewedDraft.shiftCode!,
        });
        if (target.status && target.status !== "DRAFT")
          throw new AppError(
            409,
            "CLAY_REPORT_CONTEXT_LOCKED",
            "Laporan shift sudah disubmit/disetujui dan tidak dapat diisi dari foto.",
          );
        if (target.columnCount || target.logCount || target.retaseCount)
          throw new AppError(
            409,
            "CLAY_REPORT_CONTEXT_NOT_EMPTY",
            "Laporan shift sudah memiliki kolom, log, atau retase manual. Impor foto diblokir untuk mencegah hitung ganda.",
          );
        if (draft) await repo.saveDraft(id, reviewedDraft, issues, actor);
        await repo.confirm({ item, actor, draft: reviewedDraft });
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
            "CLAY_REPARSE_NOT_ALLOWED",
            "Ulang parser hanya untuk job gagal; draft review tidak ditimpa.",
          );
        await repo.requeue(id);
      });
      return processImport(actor, id);
    },
  };
}

export type ClayPhotoReportService = ReturnType<
  typeof createClayPhotoReportService
>;
