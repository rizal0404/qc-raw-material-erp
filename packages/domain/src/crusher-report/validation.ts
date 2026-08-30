import type { CrusherReportDraft, CrusherReportIssue } from "@qc/contracts";
import { CRUSHER_REPORT_HOURS } from "@qc/contracts";
export { normalizeReportDt } from "@qc/contracts";
import type { ShiftRecord } from "../master/types";

export function reportShiftHours(shift: Pick<ShiftRecord, "code">): number[] {
  return [...(CRUSHER_REPORT_HOURS[shift.code] ?? [])];
}
export function validateCrusherReport(
  draft: CrusherReportDraft,
  shift?: ShiftRecord,
): CrusherReportIssue[] {
  const issues: CrusherReportIssue[] = [];
  const add = (
    code: string,
    path: string,
    message: string,
    severity: CrusherReportIssue["severity"] = "BLOCKING",
  ) => issues.push({ code, path, message, severity });
  if (!draft.reportDate)
    add("REPORT_DATE_REQUIRED", "reportDate", "Tanggal laporan wajib diisi.");
  if (!draft.shiftCode || !shift)
    add("SHIFT_REQUIRED", "shiftCode", "Pilih shift master yang aktif.");
  if (shift && !reportShiftHours(shift).length)
    add(
      "REPORT_SHIFT_UNSUPPORTED",
      "shiftCode",
      "Template laporan untuk shift ini belum dikonfigurasi.",
    );
  if (
    shift &&
    JSON.stringify(draft.hours) !== JSON.stringify(reportShiftHours(shift))
  )
    add(
      "SHIFT_HOURS_VALID",
      "hours",
      "Kolom jam berbeda dari template shift master; periksa kembali.",
      "WARNING",
    );
  if (!draft.vendors.length)
    add("VENDOR_REQUIRED", "vendors", "Tambahkan setidaknya satu vendor.");
  const vendors = new Set<string>(),
    blocks = new Set<string>();
  let total = 0;
  for (const [vi, v] of draft.vendors.entries()) {
    const path = `vendors.${vi}`;
    if (blocks.has(v.blockKey))
      add("BLOCK_DUPLICATE", path, "Identitas blok duplikat.");
    blocks.add(v.blockKey);
    if (!v.vendorId)
      add(
        "VENDOR_REQUIRED",
        `${path}.vendorId`,
        "Cocokkan vendor dengan master.",
      );
    else if (vendors.has(v.vendorId))
      add(
        "VENDOR_DUPLICATE",
        path,
        "Vendor dipetakan dua kali; periksa blok laporan.",
      );
    if (v.vendorId) vendors.add(v.vendorId);
    if (v.retaseTotal === null)
      add(
        "VENDOR_TOTAL_REQUIRED",
        `${path}.retaseTotal`,
        "Total tertulis vendor wajib direview.",
      );
    if (!v.vehicles.length)
      add(
        "VEHICLE_ROWS_REQUIRED",
        `${path}.vehicles`,
        "Baris DT wajib tersedia.",
      );
    const rows = new Set<number>();
    let rowTotal = 0;
    for (const [ri, row] of v.vehicles.entries()) {
      const rp = `${path}.vehicles.${ri}`;
      if (rows.has(row.rowIndex))
        add(
          "ROW_INDEX_DUPLICATE",
          rp,
          "Nomor baris sumber harus unik dalam blok; No DT boleh berulang.",
        );
      rows.add(row.rowIndex);
      if (!row.dtNo.trim())
        add("DT_REQUIRED", `${rp}.dtNo`, "No DT belum terbaca.");
      if (row.retase === null)
        add(
          "ROW_RETASE_REQUIRED",
          `${rp}.retase`,
          "Retase baris belum terbaca.",
        );
      if (row.hourly) {
        const complete =
          row.hourly.length === draft.hours.length &&
          row.hourly.every(
            (h, i) => h.hour === draft.hours[i] && h.retase !== null,
          );
        if (!complete)
          add(
            "ROW_HOURLY_INCOMPLETE",
            `${rp}.hourly`,
            "Periksa turus per jam; nilai kosong tidak diasumsikan nol.",
            "WARNING",
          );
        else if (
          row.hourly.reduce((n, h) => n + (h.retase ?? 0), 0) !== row.retase
        )
          add(
            "ROW_HOURLY_TOTAL_MATCH",
            `${rp}.retase`,
            "Jumlah turus per jam berbeda dari total retase DT.",
            "WARNING",
          );
      }
      if (!row.reviewed)
        add(
          "ROW_REVIEW_REQUIRED",
          rp,
          "Periksa No DT, jumlah retase dan assignment baris ini.",
        );
      if ((row.retase ?? 0) > 0 && !row.assignmentAaId)
        add(
          "AM_MAPPING_REQUIRED",
          `${rp}.assignmentAaId`,
          "Pilih assignment DT ke AM/Source.",
        );
      rowTotal += row.retase ?? 0;
    }
    if (v.retaseTotal !== null && rowTotal !== v.retaseTotal)
      add(
        "VENDOR_ROW_TOTAL_MATCH",
        path,
        `Jumlah baris ${rowTotal} berbeda dari total vendor ${v.retaseTotal}.`,
      );
    const hourlyComplete =
      v.hourly.length === draft.hours.length &&
      v.hourly.every((h, i) => h.hour === draft.hours[i] && h.retase !== null);
    if (v.vehicles.length && v.vehicles.every((r) => r.hourly?.length))
      for (const h of v.hourly) {
        const values = v.vehicles.map(
          (r) => r.hourly?.find((x) => x.hour === h.hour)?.retase,
        );
        if (
          values.every((x) => x != null) &&
          values.reduce<number>((n, x) => n + (x ?? 0), 0) !== h.retase
        )
          add(
            "HOURLY_MATRIX_MATCH",
            `${path}.hourly`,
            `Turus DT jam ${h.hour} berbeda dari rekap vendor.`,
            "WARNING",
          );
      }
    if (!hourlyComplete)
      add(
        "VENDOR_HOURLY_INCOMPLETE",
        `${path}.hourly`,
        "Review seluruh total per jam; kosong tidak diasumsikan nol.",
        "WARNING",
      );
    else if (
      v.retaseTotal !== null &&
      v.hourly.reduce((n, h) => n + (h.retase ?? 0), 0) !== v.retaseTotal
    )
      add(
        "VENDOR_HOURLY_TOTAL_MATCH",
        `${path}.hourly`,
        "Jumlah per jam berbeda dari total vendor.",
        "WARNING",
      );
    total += v.retaseTotal ?? 0;
  }
  if (total > 5000)
    add(
      "IMPORT_TOO_LARGE",
      "vendors",
      "Maksimum 5000 retase dalam satu laporan.",
    );
  if (draft.reportRetaseTotal !== null && draft.reportRetaseTotal !== total)
    add(
      "REPORT_RETASE_TOTAL_MATCH",
      "reportRetaseTotal",
      `Jumlah vendor ${total} berbeda dari total laporan.`,
      "WARNING",
    );
  for (const [key, value] of Object.entries(draft.production))
    if (value !== null && value < 0)
      add(
        "PRODUCTION_NON_NEGATIVE",
        `production.${key}`,
        "Nilai produksi tidak boleh negatif.",
      );
  const p = draft.production;
  if (p.runningTimeHours !== null && p.runningTimeHours <= 0)
    add(
      "RUNNING_TIME_POSITIVE",
      "production.runningTimeHours",
      "Running time harus positif.",
    );
  if (
    p.totalTon !== null &&
    p.runningTimeHours &&
    p.capacityTph !== null &&
    Math.abs(p.totalTon / p.runningTimeHours - p.capacityTph) >
      Math.max(1, p.capacityTph * 0.02)
  )
    add(
      "CAPACITY_MATCH",
      "production.capacityTph",
      "Kapasitas berbeda lebih dari toleransi 2%.",
      "WARNING",
    );
  if (
    p.pileTon !== null &&
    p.fillerTon !== null &&
    p.totalTon !== null &&
    Math.abs(p.pileTon + p.fillerTon - p.totalTon) > 0.01
  )
    add(
      "PRODUCTION_TOTAL_MATCH",
      "production.totalTon",
      "Pile + filler berbeda dari total ton.",
      "WARNING",
    );
  for (const [key, value] of Object.entries(draft.pile))
    if (value !== null && (value < 0 || value > 100))
      add("PILE_PERCENT_RANGE", `pile.${key}`, "Persentase harus 0–100.");
  const pile = draft.pile;
  if (
    pile.baratPercent !== null &&
    pile.timurPercent !== null &&
    pile.totalPercent !== null &&
    Math.abs(pile.baratPercent + pile.timurPercent - pile.totalPercent) > 0.01
  )
    add(
      "PILE_PERCENT_TOTAL_MATCH",
      "pile.totalPercent",
      "Pile barat + timur berbeda dari total.",
      "WARNING",
    );
  if (draft.header.day && draft.reportDate) {
    const expected = new Date(
      `${draft.reportDate}T12:00:00+08:00`,
    ).toLocaleDateString("id-ID", {
      weekday: "long",
      timeZone: "Asia/Makassar",
    });
    if (expected.toLowerCase() !== draft.header.day.trim().toLowerCase())
      add(
        "HEADER_DAY_DATE_MISMATCH",
        "header.day",
        `Tanggal tersebut adalah ${expected}.`,
        "WARNING",
      );
  }
  return issues;
}
