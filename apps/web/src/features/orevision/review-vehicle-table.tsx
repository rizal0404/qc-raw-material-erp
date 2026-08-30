import type {
  CounterAssignment,
  CrusherReportDraft,
  CrusherReportIssue,
  CrusherReportObservation,
  MasterLookupResponse,
} from "@qc/contracts";
import type { EquipmentLookupItem } from "../vendor/vendor-api";
import {
  matchesPhotoRowFilter,
  rowObservation,
  scoreDescription,
  type PhotoRowFilter,
} from "../retase/photo-report-review";
import { RowAssignment } from "./row-assignment";

type Vendor = CrusherReportDraft["vendors"][number];
type Edit = (path: string, value: unknown) => void;
export interface ReviewTableContext {
  draft: CrusherReportDraft;
  crusherId: string;
  assignments: CounterAssignment[];
  equipment: EquipmentLookupItem[];
  sources: MasterLookupResponse["sources"];
  observations: CrusherReportObservation[];
  issues: CrusherReportIssue[];
  canCreate: boolean;
  demo: boolean;
  lowOnly: boolean;
  filter: PhotoRowFilter;
  onBusy: (busy: boolean) => void;
  onRefresh: () => Promise<unknown>;
}
const number = (value: number | null) => (value === null ? "—" : String(value));
type HighlightSeverity = "WARNING" | "BLOCKING";
const severityClass = (severity: HighlightSeverity | null) =>
  severity === "WARNING"
    ? "orevision-warning-cell"
    : severity === "BLOCKING"
      ? "orevision-blocking-cell"
      : "";
function highestSeverity(
  issues: CrusherReportIssue[],
  path: string,
  descendants = true,
): HighlightSeverity | null {
  const matches = issues.filter(
    (issue) =>
      issue.path === path ||
      (descendants && issue.path.startsWith(`${path}.`)),
  );
  if (matches.some((issue) => issue.severity === "BLOCKING"))
    return "BLOCKING";
  if (matches.some((issue) => issue.severity === "WARNING")) return "WARNING";
  return null;
}
export function ReviewVehicleTable({
  vendor,
  index,
  disabled,
  edit,
  focus,
  context,
}: {
  vendor: Vendor;
  index: number;
  disabled: boolean;
  edit: Edit;
  focus: (path: string) => void;
  context: ReviewTableContext;
}) {
  const hours = context.draft.hours,
    prefix = `vendors.${index}.vehicles`;
  const totals = hours.map((hour) => {
    // Legacy OCR has vendor-hour totals only; never fabricate per-DT counts.
    if (vendor.vehicles.every((r) => !r.hourly))
      return vendor.hourly.find((h) => h.hour === hour)?.retase ?? null;
    const values = vendor.vehicles.map(
      (r) => r.hourly?.find((h) => h.hour === hour)?.retase,
    );
    return values.length && values.every((v) => v != null)
      ? values.reduce<number>((n, v) => n + (v ?? 0), 0)
      : null;
  });
  const sum =
    vendor.vehicles.length && vendor.vehicles.every((r) => r.retase !== null)
      ? vendor.vehicles.reduce((n, r) => n + (r.retase ?? 0), 0)
      : null;
  return (
    <table
      className="orevision-tally-table orevision-unified-table"
      aria-label={`Turus ${vendor.vendorCode}`}
    >
      <thead>
        <tr>
          <th scope="col">NO. DT</th>
          {hours.map((h) => (
            <th key={h} scope="col">
              {String(h).padStart(2, "0")}
            </th>
          ))}
          <th scope="col">TOTAL</th>
          <th scope="col">DT → AM / SOURCE</th>
          <th scope="col">REVIEW</th>
        </tr>
      </thead>
      <tbody>
        {vendor.vehicles.map((row, ri) => {
          const rowPath = `${prefix}.${ri}`,
            rowSeverity = highestSeverity(context.issues, rowPath),
            dtSeverity = highestSeverity(context.issues, `${rowPath}.dtNo`),
            hourlySeverity = highestSeverity(
              context.issues,
              `${rowPath}.hourly`,
            ),
            rowTotalSeverity = highestSeverity(
              context.issues,
              `${rowPath}.retase`,
            ),
            assignmentSeverity = highestSeverity(
              context.issues,
              `${rowPath}.assignmentAaId`,
            );
          const dt = rowObservation(
              context.observations,
              vendor.blockKey,
              row.rowIndex,
              "dtNo",
            ),
            retase = rowObservation(
              context.observations,
              vendor.blockKey,
              row.rowIndex,
              "retase",
            );
          if (
            (context.lowOnly && row.reviewed) ||
            !matchesPhotoRowFilter(row, context.filter, dt, retase)
          )
            return null;
          return (
            <tr
              key={row.rowIndex}
              className={`${row.reviewed ? "orevision-reviewed-row" : ""} ${rowSeverity === "BLOCKING" ? "orevision-blocking-row" : ""}`.trim()}
            >
              <th scope="row" className={severityClass(dtSeverity)}>
                <input
                  aria-label={`DT baris ${row.rowIndex}`}
                  className={severityClass(dtSeverity)}
                  value={row.dtNo}
                  disabled={disabled}
                  maxLength={64}
                  onFocus={() => focus(`${prefix}.${ri}.dtNo`)}
                  onChange={(e) => edit(`${prefix}.${ri}.dtNo`, e.target.value)}
                />
              </th>
              {hours.map((hour) => {
                const hi = row.hourly?.findIndex((h) => h.hour === hour) ?? -1,
                  value = row.hourly?.[hi]?.retase;
                return (
                  <td
                    key={hour}
                    className={severityClass(
                      hourlySeverity ?? rowTotalSeverity,
                    )}
                  >
                    <input
                      aria-label={`Turus ${hour} DT baris ${row.rowIndex}`}
                      className={`${
                        value == null
                          ? "missing"
                          : value > 0
                            ? "has-tally"
                            : "zero"
                      } ${severityClass(hourlySeverity ?? rowTotalSeverity)}`.trim()}
                      type="number"
                      min="0"
                      max="5000"
                      step="1"
                      inputMode="numeric"
                      placeholder="—"
                      value={value ?? ""}
                      disabled={disabled || hi < 0}
                      onFocus={() => focus(`${prefix}.${ri}.retase`)}
                      onChange={(e) =>
                        edit(
                          `${prefix}.${ri}.hourly.${hi}.retase`,
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                    />
                  </td>
                );
              })}
              <td className={severityClass(rowTotalSeverity)}>
                <input
                  className={`orevision-row-total ${severityClass(rowTotalSeverity)}`.trim()}
                  aria-label={`Retase baris ${row.rowIndex}`}
                  type="number"
                  min="0"
                  max="5000"
                  value={row.retase ?? ""}
                  placeholder="—"
                  disabled={disabled}
                  onFocus={() => focus(`${prefix}.${ri}.retase`)}
                  onChange={(e) =>
                    edit(
                      `${prefix}.${ri}.retase`,
                      e.target.value === "" ? null : Number(e.target.value),
                    )
                  }
                />
              </td>
              <td
                className={`orevision-mapping-cell ${severityClass(assignmentSeverity)}`.trim()}
              >
                <RowAssignment
                  row={row}
                  vendorId={vendor.vendorId}
                  assignments={context.assignments}
                  equipment={context.equipment}
                  draft={context.draft}
                  crusherId={context.crusherId}
                  sources={context.sources}
                  canCreate={context.canCreate}
                  disabled={disabled}
                  demo={context.demo}
                  onApply={(value) => edit(`${prefix}.${ri}`, value)}
                  onBusy={context.onBusy}
                  onRefresh={context.onRefresh}
                />
              </td>
              <td
                className={`orevision-review-cell ${severityClass(rowSeverity)}`.trim()}
              >
                <label>
                  <input
                    type="checkbox"
                    aria-label={`Review baris ${row.rowIndex}`}
                    checked={row.reviewed}
                    disabled={disabled}
                    onChange={(e) =>
                      edit(`${prefix}.${ri}.reviewed`, e.target.checked)
                    }
                  />
                  Diperiksa
                </label>
                <details>
                  <summary>Bukti / aksi</summary>
                  <small aria-label={`Skor DT baris ${row.rowIndex}`}>
                    DT: {scoreDescription(dt, row.dtNo)}
                  </small>
                  <small aria-label={`Skor retase baris ${row.rowIndex}`}>
                    Retase: {scoreDescription(retase, row.retase)}
                  </small>
                  {[dt, retase].some(
                    (o) =>
                      o?.geometry === "TEMPLATE" ||
                      o?.geometry === "GRID_ESTIMATED",
                  ) && (
                    <small className="photo-crop-warning">
                      Periksa posisi crop
                    </small>
                  )}
                  <button
                    className="orevision-engine-link"
                    onClick={() => focus(`${prefix}.${ri}.dtNo`)}
                  >
                    Lihat bukti foto
                  </button>
                  <button
                    className="orevision-engine-link"
                    disabled={disabled}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Hapus baris kosong/salah deteksi? Evidence tetap disimpan.",
                        )
                      )
                        edit(
                          prefix,
                          vendor.vehicles.filter((_, i) => i !== ri),
                        );
                    }}
                  >
                    Hapus
                  </button>
                </details>
              </td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">SUBTOTAL</th>
          {totals.map((v, i) => (
            <td
              key={hours[i]}
              className={severityClass(
                highestSeverity(
                  context.issues,
                  `${prefix.replace(/\.vehicles$/, "")}.hourly`,
                ),
              )}
            >
              {number(v)}
            </td>
          ))}
          <td
            className={`${sum === vendor.retaseTotal ? "" : "orevision-total-mismatch"} ${severityClass(highestSeverity(context.issues, `vendors.${index}`, false))}`.trim()}
          >
            {number(sum)}
          </td>
          <td colSpan={2}>
            {vendor.vehicles.filter((r) => r.reviewed).length}/
            {vendor.vehicles.length} DT diperiksa
          </td>
        </tr>
      </tfoot>
    </table>
  );
}
