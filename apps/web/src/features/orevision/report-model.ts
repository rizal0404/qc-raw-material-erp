import { draftToOreVision, type CrusherReportDraft } from "@qc/contracts";

export function reviewBalance(draft: CrusherReportDraft) {
  const complete =
    draft.vendors.length > 0 &&
    draft.hours.length > 0 &&
    draft.vendors.every(
      (v) =>
        v.retaseTotal !== null &&
        v.vehicles.length > 0 &&
        draft.hours.every(
          (hour) => v.hourly.find((h) => h.hour === hour)?.retase != null,
        ) &&
        v.vehicles.every(
          (r) =>
            r.retase !== null &&
            draft.hours.every(
              (hour) => r.hourly?.find((h) => h.hour === hour)?.retase != null,
            ),
        ),
    );
  const balanced =
    complete &&
    draft.vendors.every(
      (v) =>
        v.retaseTotal === v.vehicles.reduce((n, r) => n + (r.retase ?? 0), 0) &&
        v.vehicles.every(
          (r) =>
            r.retase ===
            draft.hours.reduce(
              (n, hour) =>
                n + (r.hourly?.find((h) => h.hour === hour)?.retase ?? 0),
              0,
            ),
        ) &&
        draft.hours.every(
          (hour) =>
            v.hourly.find((h) => h.hour === hour)?.retase ===
            v.vehicles.reduce(
              (n, r) =>
                n + (r.hourly?.find((h) => h.hour === hour)?.retase ?? 0),
              0,
            ),
        ),
    ) &&
    (draft.reportRetaseTotal === null ||
      draft.reportRetaseTotal ===
        draft.vendors.reduce((n, v) => n + (v.retaseTotal ?? 0), 0));
  return { complete, balanced };
}

export function reportAnalytics(draft: CrusherReportDraft) {
  const vendors = draft.vendors.map((v) => ({
    name: v.vendorCode,
    units: v.vehicles.length,
    total: v.vehicles.reduce((n, r) => n + (r.retase ?? 0), 0),
    complete: v.vehicles.every((r) => r.retase !== null),
  }));
  const total = vendors.reduce((n, v) => n + v.total, 0),
    units = vendors.reduce((n, v) => n + v.units, 0);
  const hourly = draft.hours.map((hour) => ({
    hour,
    total: draft.vendors.reduce(
      (n, v) => n + (v.hourly.find((h) => h.hour === hour)?.retase ?? 0),
      0,
    ),
    complete: draft.vendors.every(
      (v) => v.hourly.find((h) => h.hour === hour)?.retase != null,
    ),
  }));
  const topVendor = [...vendors].sort((a, b) => b.total - a.total)[0];
  const peak = [...hourly]
    .filter((h) => h.complete)
    .sort((a, b) => b.total - a.total)[0];
  const expectedCapacity =
    draft.production.totalTon != null &&
    (draft.production.runningTimeHours ?? 0) > 0
      ? Math.round(
          draft.production.totalTon / draft.production.runningTimeHours!,
        )
      : null;
  const discrepancies = draft.vendors.flatMap((v) => {
    const issues: string[] = [];
    for (const r of v.vehicles)
      if (
        r.hourly?.length &&
        r.hourly.every((h) => h.retase !== null) &&
        r.hourly.reduce((n, h) => n + (h.retase ?? 0), 0) !== r.retase
      )
        issues.push(
          `${v.vendorCode} DT ${r.dtNo}: turus per jam berbeda dari total tertulis.`,
        );
    if (
      v.vehicles.every((r) => r.retase !== null) &&
      v.retaseTotal !== v.vehicles.reduce((n, r) => n + (r.retase ?? 0), 0)
    )
      issues.push(`${v.vendorCode}: jumlah baris berbeda dari total vendor.`);
    return issues;
  });
  return {
    vendors,
    hourly,
    total,
    units,
    topVendor,
    peak,
    average: units ? total / units : 0,
    expectedCapacity,
    discrepancies,
    capacityValid:
      expectedCapacity !== null &&
      draft.production.capacityTph !== null &&
      Math.abs(expectedCapacity - draft.production.capacityTph) <= 2,
  };
}

const csvCell = (value: unknown) => {
  let text = value == null ? "" : String(value);
  // Quoting alone does not prevent spreadsheet formula injection.
  if (/^[\s]*[=+\-@\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export function reportCsv(draft: CrusherReportDraft): string {
  const rows: unknown[][] = [
    ["Vendor", "No_DT", ...draft.hours.map((h) => `Jam_${h}`), "Total_Rit"],
  ];
  for (const vendor of draft.vendors)
    for (const row of vendor.vehicles)
      rows.push([
        vendor.vendorCode,
        row.dtNo,
        ...draft.hours.map(
          (hour) => row.hourly?.find((h) => h.hour === hour)?.retase ?? null,
        ),
        row.retase,
      ]);
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
export function reportJson(draft: CrusherReportDraft): string {
  // Original OreVision shape plus the canonical review/mapping context.
  return JSON.stringify(
    { ...draftToOreVision(draft), canonical: draft },
    null,
    2,
  );
}
export function downloadReport(
  content: string,
  type: string,
  filename: string,
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
