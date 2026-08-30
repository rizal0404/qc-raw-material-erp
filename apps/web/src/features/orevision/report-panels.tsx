import { useMemo, useState } from "react";
import type { CrusherReportDraft } from "@qc/contracts";
import {
  downloadReport,
  reportAnalytics,
  reportCsv,
  reportJson,
} from "./report-model";

export function ReportAnalytics({ draft }: { draft: CrusherReportDraft }) {
  const data = useMemo(() => reportAnalytics(draft), [draft]);
  const max = Math.max(1, ...data.hourly.map((h) => h.total));
  return (
    <div className="page-stack">
      <div className="orevision-kpis">
        {[
          [
            "Total ritase",
            `${data.total} rit`,
            `${draft.vendors.length} vendor · ${data.units} baris DT`,
          ],
          [
            "Vendor terproduktif",
            data.topVendor?.name ?? "—",
            `${data.topVendor?.total ?? 0} rit`,
          ],
          [
            "Jam beban tertinggi",
            data.peak && data.peak.total > 0 ? `${data.peak.hour}:00` : "—",
            `${data.peak?.total ?? 0} rit`,
          ],
          ["Rata-rata / baris DT", data.average.toFixed(1), "rit per baris DT"],
        ].map(([label, value, note]) => (
          <div className="card" key={label}>
            <span className="card-label">{label}</span>
            <strong>{value}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>
      <p className="photo-help">
        Analitik mengikuti koreksi draft saat ini; nilai kosong tidak dihitung
        dan hasil bukan data final sebelum konfirmasi.
      </p>
      <section className="card">
        <h3>Kontribusi ritase per vendor</h3>
        <div className="orevision-bars">
          {data.vendors.map((v, i) => (
            <div key={i}>
              <span>
                {v.name} · {v.units} DT{" "}
                <b>
                  {v.total} rit (
                  {data.total ? ((100 * v.total) / data.total).toFixed(1) : 0}%)
                  {!v.complete ? " · belum lengkap" : ""}
                </b>
              </span>
              <meter
                min={0}
                max={Math.max(1, data.total)}
                value={v.total}
                aria-label={`Kontribusi ${v.name}`}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Distribusi ritase per jam · WITA</h3>
        <div className="orevision-hour-chart">
          {data.hourly.map((h) => (
            <div key={h.hour}>
              <div
                style={{ height: `${Math.max(4, (h.total / max) * 120)}px` }}
              >
                {h.total}
              </div>
              <span>{String(h.hour).padStart(2, "0")}:00</span>
              {!h.complete && <small>Belum lengkap</small>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export function ReportExport({
  draft,
  demo,
  dirty,
}: {
  draft: CrusherReportDraft;
  demo: boolean;
  dirty: boolean;
}) {
  const [message, setMessage] = useState("");
  const payload = useMemo(() => reportJson(draft), [draft]);
  const prefix = `${demo ? "DEMO_" : ""}Laporan_Limestone_${draft.reportDate ?? "draft"}`;
  const copy = async () => {
    try {
      if (navigator.clipboard?.writeText)
        await navigator.clipboard.writeText(payload);
      else {
        const area = document.createElement("textarea");
        area.value = payload;
        document.body.appendChild(area);
        area.select();
        try {
          if (!document.execCommand("copy")) throw new Error("copy");
        } finally {
          area.remove();
        }
      }
      setMessage("JSON berhasil disalin.");
    } catch {
      setMessage("Clipboard tidak tersedia. Gunakan Unduh JSON.");
    }
  };
  return (
    <div className="page-stack">
      <section className="card">
        <h3>Ekspor data & integrasi API</h3>
        <p>
          CSV untuk Excel/Google Sheets; JSON memuat struktur OreVision lengkap
          beserta canonical draft dan assignment.
        </p>
        <p className="photo-help">
          {demo
            ? "Data DEMO — bukan laporan produksi."
            : dirty
              ? "Ekspor mencakup koreksi yang belum disimpan."
              : "Status final tetap mengikuti konfirmasi laporan."}{" "}
          Ekspor tidak mengirim data ke ERP secara otomatis.
        </p>
        <div className="inline-actions">
          <button
            className="btn primary"
            onClick={() =>
              downloadReport(
                reportCsv(draft),
                "text/csv;charset=utf-8",
                `${prefix}.csv`,
              )
            }
          >
            Unduh CSV
          </button>
          <button className="btn" onClick={() => void copy()}>
            Salin JSON
          </button>
          <button
            className="btn"
            onClick={() =>
              downloadReport(payload, "application/json", `${prefix}.json`)
            }
          >
            Unduh JSON
          </button>
        </div>
        {message && <p role="status">{message}</p>}
      </section>
      <section className="card">
        <h3>Payload preview · application/json</h3>
        <pre className="orevision-json">{payload}</pre>
      </section>
    </div>
  );
}

type Edit = (path: string, value: unknown) => void;
export function DocumentDetails({
  draft,
  edit,
  disabled,
}: {
  draft: CrusherReportDraft;
  edit: Edit;
  disabled: boolean;
}) {
  const doc = draft.document,
    data = reportAnalytics(draft);
  if (!doc) return null;
  return (
    <section className="card">
      <h3>Informasi dokumen & rekonsiliasi OreVision</h3>
      <div className="form-grid">
        {(
          [
            "title",
            "company",
            "shiftText",
            "startStop",
            "location",
            "signedBy",
          ] as const
        ).map((key) => (
          <label key={key}>
            <span>
              {
                {
                  title: "Judul laporan",
                  company: "Perusahaan",
                  shiftText: "Shift tertulis",
                  startStop: "Start / stop",
                  location: "Lokasi",
                  signedBy: "Pengesahan",
                }[key]
              }
            </span>
            <input
              value={doc[key] ?? ""}
              disabled={disabled}
              onChange={(e) => edit(`document.${key}`, e.target.value || null)}
            />
          </label>
        ))}
      </div>
      <p>
        Validasi kapasitas: {draft.production.totalTon ?? "—"} ton ÷{" "}
        {draft.production.runningTimeHours ?? "—"} jam ={" "}
        {data.expectedCapacity ?? "—"} ton/jam.{" "}
        <span
          className={`status-badge ${data.capacityValid ? "success" : "warning"}`}
        >
          {data.capacityValid ? "Sesuai form" : "Perlu pemeriksaan"}
        </span>
      </p>
      {data.discrepancies.length > 0 && (
        <ul className="orevision-discrepancies">
          {data.discrepancies.map((text, i) => (
            <li key={i}>{text}</li>
          ))}
        </ul>
      )}
      <h3>Log kejadian operasional · {doc.logs.length} catatan</h3>
      <div className="orevision-logs">
        {doc.logs.map((log, i) => (
          <div key={i}>
            <input
              aria-label={`Jam log ${i + 1}`}
              value={log.time ?? ""}
              disabled={disabled}
              onChange={(e) =>
                edit(`document.logs.${i}.time`, e.target.value || null)
              }
            />
            <input
              aria-label={`Keterangan log ${i + 1}`}
              value={log.text}
              disabled={disabled}
              onChange={(e) => edit(`document.logs.${i}.text`, e.target.value)}
            />
            <select
              aria-label={`Jenis log ${i + 1}`}
              value={log.type}
              disabled={disabled}
              onChange={(e) => edit(`document.logs.${i}.type`, e.target.value)}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="stop">Stop</option>
            </select>
            <button
              className="btn small"
              disabled={disabled}
              onClick={() =>
                edit(
                  "document.logs",
                  doc.logs.filter((_, n) => n !== i),
                )
              }
            >
              Hapus log
            </button>
          </div>
        ))}
      </div>
      <button
        className="btn small"
        disabled={disabled || doc.logs.length >= 100}
        onClick={() =>
          edit("document.logs", [
            ...doc.logs,
            { time: null, text: "", type: "info" },
          ])
        }
      >
        + Log kejadian
      </button>
    </section>
  );
}
