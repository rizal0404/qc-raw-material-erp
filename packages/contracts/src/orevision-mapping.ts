import {
  CRUSHER_REPORT_HOURS,
  CrusherReportDraftSchema,
  type CrusherReportDraft,
} from "./crusher-report";
import { OreVisionReportSchema, type OreVisionReport } from "./orevision";

export function oreVisionToDraft(
  input: unknown,
  provider: string,
  model: string,
  shiftHours = CRUSHER_REPORT_HOURS,
): CrusherReportDraft {
  const report = OreVisionReportSchema.parse(input);
  const shiftText = report.header.shift?.trim().toUpperCase() ?? "";
  const explicitShift = /^(?:SHIFT[ _-]?|S)?([123])$/.exec(shiftText)?.[1];
  const inferred = explicitShift
    ? `SHIFT_${explicitShift}`
    : /PAGI/.test(shiftText)
      ? "SHIFT_1"
      : /SIANG|SORE/.test(shiftText)
        ? "SHIFT_2"
        : /MALAM/.test(shiftText)
          ? "SHIFT_3"
          : null;
  const hours =
    report.hours ?? (inferred ? shiftHours[inferred] : undefined) ?? [];
  const shiftCode = inferred && shiftHours[inferred]?.length ? inferred : null;
  const completeSum = (values: (number | null | undefined)[]) =>
    values.length && values.every((v) => v != null)
      ? values.reduce<number>((n, v) => n + (v ?? 0), 0)
      : null;
  return CrusherReportDraftSchema.parse({
    schemaVersion: "1.0",
    reportDate: report.header.date,
    shiftCode,
    timezone: "Asia/Makassar",
    hours,
    header: {
      day: null,
      crusherCode: null,
      operatorName: report.header.opRoom,
    },
    document: {
      title: report.header.title,
      company: report.header.company,
      shiftText: report.header.shift,
      startStop: report.header.startStop,
      location: report.footer.location,
      signedBy: report.footer.signedBy,
      logs: report.logs,
      provider,
      model,
    },
    vendors: report.vendors.map((vendor, index) => ({
      blockKey: `vision-${index}`,
      vendorCode: vendor.name,
      vendorId: null,
      retaseTotal: vendor.manualHeaderTotal,
      vehicles: vendor.records.map((r, i) => ({
        rowIndex: i + 1,
        dtNo: r.dt ?? "",
        retase: r.manualTotal,
        assignmentAaId: null,
        reviewed: false,
        hourly: hours.map((hour) => ({ hour, retase: r[`h${hour}`] ?? null })),
      })),
      hourly: hours.map((hour) => ({
        hour,
        retase: completeSum(vendor.records.map((r) => r[`h${hour}`])),
      })),
    })),
    production: {
      pileTon: report.footer.pileTon,
      fillerTon: report.footer.fillerTon,
      totalTon: report.footer.totalTon,
      runningTimeHours: report.footer.runningTime,
      capacityTph: report.footer.capacityPerHour,
    },
    pile: {
      baratPercent: report.footer.stockPileBarat,
      timurPercent: report.footer.stockPileTimur,
      totalPercent: report.footer.totalStock,
    },
    notes: {
      raw:
        report.logs
          .map((log) => `${log.time ?? ""} ${log.text}`)
          .join("\n")
          .slice(0, 20000) || null,
    },
    reportRetaseTotal: null,
  });
}

// Export current corrections, not a stale copy of the AI response.
export function draftToOreVision(draft: CrusherReportDraft): OreVisionReport {
  const doc = draft.document;
  return OreVisionReportSchema.parse({
    hours: draft.hours.length ? draft.hours : undefined,
    header: {
      title: doc?.title ?? null,
      company: doc?.company ?? null,
      date: draft.reportDate,
      opRoom: draft.header.operatorName,
      shift: draft.shiftCode ?? doc?.shiftText ?? null,
      startStop: doc?.startStop ?? null,
    },
    vendors: draft.vendors.map((v) => ({
      id: v.blockKey,
      name: v.vendorCode,
      manualHeaderTotal: v.retaseTotal,
      records: v.vehicles.map((r) => ({
        id: `${v.blockKey}-${r.rowIndex}`,
        dt: r.dtNo,
        manualTotal: r.retase,
        ...Object.fromEntries(
          (r.hourly ?? []).map((h) => [`h${h.hour}`, h.retase]),
        ),
      })),
    })),
    logs:
      doc?.logs ??
      (draft.notes.raw
        ? [{ time: null, text: draft.notes.raw, type: "info" }]
        : []),
    footer: {
      pileTon: draft.production.pileTon,
      fillerTon: draft.production.fillerTon,
      totalTon: draft.production.totalTon,
      runningTime: draft.production.runningTimeHours,
      capacityPerHour: draft.production.capacityTph,
      stockPileBarat: draft.pile.baratPercent,
      stockPileTimur: draft.pile.timurPercent,
      totalStock: draft.pile.totalPercent,
      location: doc?.location ?? null,
      signedBy: doc?.signedBy ?? null,
    },
  });
}
