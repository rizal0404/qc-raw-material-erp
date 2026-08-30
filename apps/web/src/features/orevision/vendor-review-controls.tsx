import type { CrusherReportDraft, MasterLookupResponse } from "@qc/contracts";
import type { PhotoRowFilter } from "../retase/photo-report-review";
type Edit = (path: string, value: unknown) => void;
export function VendorReviewControls({
  draft,
  index,
  vendors,
  disabled,
  edit,
  lowOnly,
  setLowOnly,
  filter,
  setFilter,
  onSelect,
}: {
  draft: CrusherReportDraft;
  index: number;
  vendors: MasterLookupResponse["vendors"];
  disabled: boolean;
  edit: Edit;
  lowOnly: boolean;
  setLowOnly: (value: boolean) => void;
  filter: PhotoRowFilter;
  setFilter: (value: PhotoRowFilter) => void;
  onSelect: (value: string) => void;
}) {
  const vendor = draft.vendors[index];
  const newRow = (rowIndex: number) => ({
    rowIndex,
    dtNo: "",
    equipmentId: null,
    retase: null,
    assignmentAaId: null,
    reviewed: false,
    ...(draft.document
      ? { hourly: draft.hours.map((hour) => ({ hour, retase: null })) }
      : {}),
  });
  return (
    <div className="orevision-vendor-controls">
      {vendor && (
        <div className="orevision-vendor-config">
          <label>
            <span>Vendor master</span>
            <select
              aria-label={`Vendor ${vendor.blockKey}`}
              value={vendor.vendorId ?? ""}
              disabled={disabled}
              onChange={(e) =>
                edit(`vendors.${index}.vendorId`, e.target.value || null)
              }
            >
              <option value="">Cocokkan vendor</option>
              {vendors
                .filter(
                  (v) =>
                    v.active &&
                    (!v.materialKinds || v.materialKinds.includes("LS")),
                )
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Total vendor tertulis</span>
            <input
              aria-label={`Total ${vendor.blockKey}`}
              type="number"
              min="0"
              value={vendor.retaseTotal ?? ""}
              disabled={disabled}
              onChange={(e) =>
                edit(
                  `vendors.${index}.retaseTotal`,
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            />
          </label>
          <button
            className="btn small"
            disabled={disabled || vendor.vehicles.length === 0}
            onClick={() =>
              edit(
                `vendors.${index}.vehicles`,
                vendor.vehicles.map((r) => ({
                  ...r,
                  reviewed:
                    !!r.dtNo.trim() &&
                    r.retase !== null &&
                    (r.retase === 0 || !!r.assignmentAaId),
                })),
              )
            }
          >
            Tandai vendor diperiksa
          </button>
        </div>
      )}
      <details className="orevision-review-tools">
        <summary>Filter, koreksi subtotal & kelola baris</summary>
        <label className="photo-filter">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Tampilkan hanya baris yang belum diperiksa
        </label>
        <label>
          <span>Filter masalah OCR</span>
          <select
            aria-label="Filter masalah OCR"
            value={filter}
            onChange={(e) => setFilter(e.target.value as PhotoRowFilter)}
          >
            <option value="all">Semua baris</option>
            <option value="low">Skor rendah / tidak tersedia</option>
            <option value="unreadable">DT / retase belum terisi</option>
            <option value="geometry">Posisi crop perlu diperiksa</option>
            <option value="mapping">Assignment belum dipilih</option>
          </select>
        </label>
        <p className="photo-help">
          Skor OCR belum terkalibrasi, bukan persentase peluang benar. Gunakan
          bukti foto saat memeriksa.
        </p>
        {vendor && (
          <>
            <div className="photo-hourly">
              {vendor.hourly.map((h, hi) => (
                <label key={h.hour}>
                  <span>{h.hour}:00</span>
                  <input
                    aria-label={`Jam ${h.hour} ${vendor.blockKey}`}
                    type="number"
                    min="0"
                    value={h.retase ?? ""}
                    disabled={disabled}
                    onChange={(e) =>
                      edit(
                        `vendors.${index}.hourly.${hi}.retase`,
                        e.target.value === "" ? null : Number(e.target.value),
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <button
              className="btn small"
              disabled={disabled || vendor.vehicles.length >= 100}
              onClick={() =>
                edit(`vendors.${index}.vehicles`, [
                  ...vendor.vehicles,
                  newRow(
                    Math.max(1000, ...vendor.vehicles.map((r) => r.rowIndex)) +
                      1,
                  ),
                ])
              }
            >
              + Baris DT
            </button>
            <button
              className="btn small"
              disabled={disabled}
              onClick={() => {
                if (
                  window.confirm(
                    "Hapus blok vendor dari draft? Evidence tetap tersimpan.",
                  )
                )
                  edit(
                    "vendors",
                    draft.vendors.filter((_, i) => i !== index),
                  );
              }}
            >
              Hapus blok vendor
            </button>
          </>
        )}
        <button
          className="btn small"
          disabled={disabled || draft.vendors.length >= 12}
          onClick={() => {
            const key = crypto.randomUUID();
            edit("vendors", [
              ...draft.vendors,
              {
                blockKey: key,
                vendorCode: "Vendor tambahan",
                vendorId: null,
                retaseTotal: null,
                hourly: draft.hours.map((hour) => ({ hour, retase: null })),
                vehicles: [newRow(1)],
              },
            ]);
            onSelect(key);
          }}
        >
          + Blok vendor
        </button>
      </details>
    </div>
  );
}
