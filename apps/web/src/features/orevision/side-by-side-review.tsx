import type { CrusherReportDraft } from "@qc/contracts";
import type { ReactNode } from "react";
import {
  ReviewVehicleTable,
  type ReviewTableContext,
} from "./review-vehicle-table";
import { AppIcon } from "../../components/app-icon";
import { reportAnalytics, reviewBalance } from "./report-model";

type Edit = (path: string, value: unknown) => void;

const number = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export function ReviewHeader({
  draft,
  disabled,
  edit,
  focus,
  shifts,
}: {
  draft: CrusherReportDraft;
  disabled: boolean;
  edit: Edit;
  focus: (path: string) => void;
  shifts: { code: string; label: string; startTime: string; endTime: string }[];
}) {
  const balance = reviewBalance(draft);
  return (
    <header className="card orevision-review-header">
      <div className="orevision-report-title">
        <span className="eyebrow">FORMULIR · LIMESTONE</span>
        <h3>{draft.document?.title || "Laporan harian Limestone Crusher"}</h3>
        <span
          className={`orevision-balance ${balance.balanced ? "balanced" : "unbalanced"}`}
        >
          <AppIcon name={balance.balanced ? "check" : "reconcile"} size={15} />
          {balance.balanced
            ? "Semua turus dan subtotal cocok"
            : balance.complete
              ? "Ada selisih turus / subtotal — periksa kembali"
              : "Angka belum lengkap — review diperlukan"}
        </span>
        <small>Kecocokan angka bukan konfirmasi ke rekonsiliasi.</small>
      </div>
      <div className="orevision-report-context">
        <label>
          <span>Tanggal laporan</span>
          <input
            type="date"
            value={draft.reportDate ?? ""}
            disabled={disabled}
            onFocus={() => focus("reportDate")}
            onChange={(e) => edit("reportDate", e.target.value || null)}
          />
        </label>
        <label>
          <span>Operator C. Room</span>
          <input
            value={draft.header.operatorName ?? ""}
            disabled={disabled}
            onFocus={() => focus("header.operatorName")}
            onChange={(e) =>
              edit("header.operatorName", e.target.value || null)
            }
          />
        </label>
        <label>
          <span>Shift</span>
          <select
            value={draft.shiftCode ?? ""}
            disabled={disabled}
            onFocus={() => focus("shiftCode")}
            onChange={(e) => edit("shiftCode", e.target.value || null)}
          >
            <option value="">Pilih shift</option>
            {shifts.map((s) => (
              <option key={s.code} value={s.code}>
                {s.label} · {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}

export function ReviewMatrix({
  draft,
  selectedVendor,
  selectVendor,
  disabled,
  edit,
  focus,
  onSave,
  saving,
  dirty,
  onDetails,
  toolbar,
  context,
  onConfirm,
  canConfirm,
  confirming,
  busy,
}: {
  toolbar: ReactNode;
  context: ReviewTableContext;
  onConfirm: () => void;
  canConfirm: boolean;
  confirming: boolean;
  busy: boolean;
  draft: CrusherReportDraft;
  selectedVendor: string;
  selectVendor: (key: string) => void;
  disabled: boolean;
  edit: Edit;
  focus: (path: string) => void;
  onSave: () => void;
  saving: boolean;
  dirty: boolean;
  onDetails: () => void;
}) {
  const index = Math.max(
    0,
    draft.vendors.findIndex((v) => v.blockKey === selectedVendor),
  );
  const vendor = draft.vendors[index];
  return (
    <section
      className="card orevision-matrix-panel"
      aria-label="Review turus per vendor"
    >
      <div className="orevision-vendor-bar">
        <div
          className="orevision-vendor-tabs"
          role="tablist"
          aria-label="Vendor review turus"
        >
          {draft.vendors.map((v, vi) => (
            <button
              key={v.blockKey}
              id={`orevision-vendor-tab-${vi}`}
              role="tab"
              disabled={busy}
              aria-selected={vi === index}
              aria-controls="orevision-vendor-matrix"
              tabIndex={vi === index ? 0 : -1}
              onClick={() => selectVendor(v.blockKey)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (vi + 1) % draft.vendors.length
                    : event.key === "ArrowLeft"
                      ? (vi + draft.vendors.length - 1) % draft.vendors.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? draft.vendors.length - 1
                          : null;
                if (next === null) return;
                event.preventDefault();
                selectVendor(draft.vendors[next]!.blockKey);
                document
                  .getElementById(`orevision-vendor-tab-${next}`)
                  ?.focus();
              }}
            >
              <span>{v.vendorCode || "Vendor"}</span>
              <b>
                {number(v.retaseTotal)}
                <small>Rit</small>
              </b>
            </button>
          ))}
        </div>
        <span className="orevision-unit-count">
          {vendor?.vehicles.length ?? 0} Unit
          <br />
          Dump Truck
        </span>
      </div>
      {toolbar}
      <div
        className="orevision-matrix-scroll"
        id="orevision-vendor-matrix"
        role="tabpanel"
        aria-labelledby={`orevision-vendor-tab-${index}`}
        tabIndex={0}
        key={vendor?.blockKey}
      >
        {vendor ? (
          <ReviewVehicleTable
            vendor={vendor}
            index={index}
            disabled={disabled}
            edit={edit}
            focus={focus}
            context={context}
          />
        ) : (
          <p className="photo-help">
            Belum ada vendor. Tambahkan blok melalui kontrol vendor di atas.
          </p>
        )}
      </div>
      <footer className="orevision-matrix-footer">
        <span>
          <AppIcon name="report" size={16} />
          {draft.document?.logs.length ?? 0} catatan operasional
        </span>
        <div className="inline-actions">
          <button className="orevision-engine-link" onClick={onDetails}>
            Metadata laporan
          </button>
          <button
            className="btn primary small"
            disabled={disabled || !dirty}
            onClick={onSave}
            title="Menyimpan koreksi draft; konfirmasi ke rekonsiliasi tetap terpisah."
          >
            <AppIcon name="check" size={15} />
            {saving ? "Menyimpan…" : "Simpan draft"}
          </button>
          <button
            className="btn primary small"
            disabled={!canConfirm || disabled}
            onClick={onConfirm}
          >
            {confirming ? "Mengirim…" : "Verifikasi & kirim ke rekonsiliasi"}
          </button>
        </div>
      </footer>
    </section>
  );
}

export function ReviewSummary({
  draft,
  onDetails,
}: {
  draft: CrusherReportDraft;
  onDetails: () => void;
}) {
  const data = reportAnalytics(draft),
    doc = draft.document;
  return (
    <div className="orevision-review-summary">
      <section className="card orevision-log-summary">
        <header>
          <h3>
            <AppIcon name="report" size={18} />
            Log kejadian & keterangan operasional
          </h3>
          <span>{doc?.logs.length ?? 0} catatan</span>
        </header>
        <div className="orevision-log-list">
          {doc?.logs.length ? (
            doc.logs.map((log, i) => (
              <div key={i}>
                <time>{log.time || "—"}</time>
                <p>{log.text || "Belum diisi"}</p>
                <span className={`orevision-log-type ${log.type}`}>
                  {log.type.toUpperCase()}
                </span>
              </div>
            ))
          ) : (
            <p className="photo-help">
              {draft.notes.raw || "Belum ada catatan operasional."}
            </p>
          )}
        </div>
        <button className="orevision-engine-link" onClick={onDetails}>
          Edit catatan & detail laporan
        </button>
      </section>
      <section className="card orevision-production-summary">
        <header>
          <h3>
            <AppIcon name="chart" size={18} />
            Rekonsiliasi produksi & kapasitas crusher
          </h3>
          <small>Pengesahan: {doc?.signedBy || "—"}</small>
        </header>
        <div className="orevision-production-metrics">
          {[
            ["Total produksi", draft.production.totalTon, "ton"],
            ["Running time", draft.production.runningTimeHours, "jam"],
            ["Kapasitas T/J", draft.production.capacityTph, "ton/jam"],
            ["Total stock pile", draft.pile.totalPercent, "%"],
          ].map(([label, value, unit]) => (
            <div key={String(label)}>
              <span>{label}</span>
              <strong>{number(value as number | null)}</strong>
              <small>{unit}</small>
            </div>
          ))}
        </div>
        <p
          className={`orevision-capacity-check ${data.capacityValid ? "balanced" : "unbalanced"}`}
        >
          Validasi rumus: {number(draft.production.totalTon)} ton ÷{" "}
          {number(draft.production.runningTimeHours)} jam ={" "}
          {number(data.expectedCapacity)} ton/jam{" "}
          <strong>
            {data.capacityValid ? "✓ Sesuai form" : "· Perlu pemeriksaan"}
          </strong>
        </p>
      </section>
    </div>
  );
}

// Explicit demo facsimile, never substituted for a real uploaded source image.
export function DemoDocument({
  draft,
  vendorKey,
}: {
  draft: CrusherReportDraft;
  vendorKey: string;
}) {
  const vendor =
    draft.vendors.find((v) => v.blockKey === vendorKey) || draft.vendors[0]!;
  return (
    <article
      className="orevision-demo-paper"
      aria-label="Ilustrasi dokumen demo"
    >
      <small>ILUSTRASI DATA CONTOH · BUKAN FOTO UNGGAHAN</small>
      <h4>{draft.document?.company}</h4>
      <h4>{draft.document?.title}</h4>
      <p>
        OP. C. ROOM: {draft.header.operatorName} · TGL: {draft.reportDate}
      </p>
      <div className="orevision-paper-vendor">
        VENDOR: {vendor.vendorCode}
        <b>TOTAL: {vendor.retaseTotal} Rit</b>
      </div>
      <table>
        <thead>
          <tr>
            <th>DT</th>
            {draft.hours.map((h) => (
              <th key={h}>{h}</th>
            ))}
            <th>TOT</th>
          </tr>
        </thead>
        <tbody>
          {vendor.vehicles.map((r) => (
            <tr key={r.rowIndex}>
              <td>{r.dtNo}</td>
              {draft.hours.map((h) => (
                <td key={h}>
                  {"|".repeat(
                    Math.min(
                      12,
                      r.hourly?.find((cell) => cell.hour === h)?.retase ?? 0,
                    ),
                  )}
                </td>
              ))}
              <td>{r.retase}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>KETERANGAN OPERASIONAL</h4>
      <p>
        {draft.document?.logs
          .map((log) => `${log.time} ${log.text}`)
          .join(" / ")}
      </p>
      <div className="orevision-paper-vendor">
        <span>
          Total ton: {number(draft.production.totalTon)}
          <br />
          Kapasitas: {number(draft.production.capacityTph)} T/J
        </span>
        <span>
          Running: {number(draft.production.runningTimeHours)} jam
          <br />
          Stock: {number(draft.pile.totalPercent)} %
        </span>
      </div>
    </article>
  );
}
