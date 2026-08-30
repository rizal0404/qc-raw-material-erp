import { useMemo } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import type {
  CounterAssignment,
  CrusherReportDraft,
  CrusherReportObservation,
} from "@qc/contracts";
import {
  matchesPhotoRowFilter,
  rowObservation,
  scoreDescription,
  type PhotoRowFilter,
} from "../retase/photo-report-review";
const numeric = (value: string) => (value === "" ? null : Number(value));
const normalizeDt = (value: string) =>
  value
    .toUpperCase()
    .replace(/^(AA|DT)\s*[-.]?\s*/, "")
    .replace(/\s/g, "")
    .replace(/^0+(?=\d)/, "");
type Vehicle = CrusherReportDraft["vendors"][number]["vehicles"][number];
type Edit = (path: string, value: unknown) => void;

export function VehicleTable({
  vendor,
  index,
  assignments,
  edit,
  focus,
  observations,
  disabled,
  lowOnly,
  filter,
}: {
  vendor: CrusherReportDraft["vendors"][number];
  index: number;
  assignments: CounterAssignment[];
  edit: Edit;
  focus: (path: string) => void;
  observations: CrusherReportObservation[];
  disabled: boolean;
  lowOnly: boolean;
  filter: PhotoRowFilter;
}) {
  const prefix = `vendors.${index}.vehicles`;
  const columns = useMemo<ColumnDef<Vehicle>[]>(
    () => [
      { header: "Baris", accessorKey: "rowIndex" },
      {
        header: "No DT / AA",
        cell: ({ row }) => (
          <input
            aria-label={`DT baris ${row.original.rowIndex}`}
            value={row.original.dtNo}
            disabled={disabled}
            onFocus={() => focus(`${prefix}.${row.index}.dtNo`)}
            onChange={(e) =>
              edit(`${prefix}.${row.index}.dtNo`, e.target.value)
            }
          />
        ),
      },
      ...(vendor.vehicles.some((r) => r.hourly?.length)
        ? vendor.hourly
        : []
      ).map((h, hi): ColumnDef<Vehicle> => ({
        header: `Jam ${h.hour}`,
        id: `hour-${h.hour}`,
        cell: ({ row }) => (
          <input
            aria-label={`Turus ${h.hour} DT baris ${row.original.rowIndex}`}
            type="number"
            min="0"
            step="1"
            value={row.original.hourly?.[hi]?.retase ?? ""}
            disabled={disabled || !row.original.hourly?.[hi]}
            onChange={(e) =>
              edit(
                `${prefix}.${row.index}.hourly.${hi}.retase`,
                numeric(e.target.value),
              )
            }
          />
        ),
      })),
      {
        header: "Retase",
        cell: ({ row }) => (
          <input
            aria-label={`Retase baris ${row.original.rowIndex}`}
            type="number"
            min="0"
            step="1"
            value={row.original.retase ?? ""}
            disabled={disabled}
            onFocus={() => focus(`${prefix}.${row.index}.retase`)}
            onChange={(e) =>
              edit(`${prefix}.${row.index}.retase`, numeric(e.target.value))
            }
          />
        ),
      },
      {
        header: "Assignment AM / Source",
        cell: ({ row }) => {
          const options = assignments
            .filter((a) => a.vendorId === vendor.vendorId)
            .flatMap((a) =>
              a.aa
                .filter(
                  (aa) =>
                    normalizeDt(aa.unitNo) === normalizeDt(row.original.dtNo),
                )
                .map((aa) => ({
                  id: aa.assignmentAaId,
                  label: `AM ${a.amUnitNo} · ${a.sourceName ?? a.blockSnapshot ?? "—"} · AA ${aa.unitNo}${a.validFrom ? ` · ${a.validFrom}–${a.validTo}` : ""}`,
                })),
            );
          return (
            <select
              aria-label={`Assignment baris ${row.original.rowIndex}`}
              disabled={disabled}
              value={row.original.assignmentAaId ?? ""}
              onChange={(e) =>
                edit(
                  `${prefix}.${row.index}.assignmentAaId`,
                  e.target.value || null,
                )
              }
            >
              <option value="">
                {options.length ? "Pilih AM / route" : "Belum ada kecocokan DT"}
              </option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          );
        },
      },
      {
        header: "OCR / Review",
        cell: ({ row }) => {
          const dt = rowObservation(
            observations,
            vendor.blockKey,
            row.original.rowIndex,
            "dtNo",
          );
          const retase = rowObservation(
            observations,
            vendor.blockKey,
            row.original.rowIndex,
            "retase",
          );
          return (
            <div
              className="photo-row-scores"
              title="Skor OCR belum terkalibrasi; bukan probabilitas angka benar."
            >
              <small aria-label={`Skor DT baris ${row.original.rowIndex}`}>
                DT: {scoreDescription(dt, row.original.dtNo)}
              </small>
              <small aria-label={`Skor retase baris ${row.original.rowIndex}`}>
                Retase: {scoreDescription(retase, row.original.retase)}
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
              <label className="photo-row-review">
                <input
                  type="checkbox"
                  aria-label={`Review baris ${row.original.rowIndex}`}
                  disabled={disabled}
                  checked={row.original.reviewed}
                  onChange={(e) =>
                    edit(`${prefix}.${row.index}.reviewed`, e.target.checked)
                  }
                />
                Diperiksa
              </label>
            </div>
          );
        },
      },
      {
        header: "",
        id: "remove",
        cell: ({ row }) => (
          <button
            type="button"
            className="btn small"
            disabled={disabled}
            onClick={() => {
              if (
                window.confirm(
                  "Hapus baris kosong/salah deteksi dari draft? Evidence OCR tetap disimpan.",
                )
              )
                edit(
                  prefix,
                  vendor.vehicles.filter((_, i) => i !== row.index),
                );
            }}
          >
            Hapus
          </button>
        ),
      },
    ],
    [assignments, disabled, edit, focus, index, observations, prefix, vendor],
  );
  const table = useReactTable({
    data: vendor.vehicles,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });
  return (
    <div className="table-shell">
      <table className="native-table photo-vehicle-table">
        <thead>
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((h) => (
                <th key={h.id}>
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table
            .getRowModel()
            .rows.filter(
              (row) =>
                (!lowOnly || !row.original.reviewed) &&
                matchesPhotoRowFilter(
                  row.original,
                  filter,
                  rowObservation(
                    observations,
                    vendor.blockKey,
                    row.original.rowIndex,
                    "dtNo",
                  ),
                  rowObservation(
                    observations,
                    vendor.blockKey,
                    row.original.rowIndex,
                    "retase",
                  ),
                ),
            )
            .map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
