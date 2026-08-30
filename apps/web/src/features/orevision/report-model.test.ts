import { describe, expect, it } from "vitest";
import { SAMPLE_IMPORT } from "./sample-report";
import {
  reportAnalytics,
  reportCsv,
  reportJson,
  reviewBalance,
} from "./report-model";

describe("OreVision analytics and export", () => {
  it("only reports balanced numbers when rows, hourly subtotals and written totals are complete and equal", () => {
    const draft = structuredClone(SAMPLE_IMPORT.draft!);
    expect(reviewBalance(draft)).toEqual({ complete: true, balanced: true });
    draft.vendors[0]!.hourly[0]!.retase! += 1;
    expect(reviewBalance(draft).balanced).toBe(false);
    draft.vendors[0]!.vehicles[0]!.hourly![0]!.retase = null;
    expect(reviewBalance(draft)).toEqual({ complete: false, balanced: false });
    draft.vendors = [];
    expect(reviewBalance(draft)).toEqual({ complete: false, balanced: false });
  });
  it("computes every KPI from the current draft and handles an empty table", () => {
    const draft = structuredClone(SAMPLE_IMPORT.draft!);
    const original = reportAnalytics(draft);
    draft.vendors[0]!.vehicles[0]!.retase = 99;
    expect(reportAnalytics(draft).total).toBe(original.total + 95);
    draft.vendors = [];
    expect(reportAnalytics(draft)).toMatchObject({
      total: 0,
      units: 0,
      average: 0,
    });
  });
  it("escapes CSV and formulas, keeps blank distinct from zero, and exports current corrections", () => {
    const draft = structuredClone(SAMPLE_IMPORT.draft!);
    const vendor = draft.vendors[0]!;
    vendor.vendorCode = '=HYPERLINK("bad")';
    vendor.vehicles[0]!.hourly![0]!.retase = null;
    draft.document!.signedBy = "Koreksi";
    const csv = reportCsv(draft);
    expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
    expect(csv).toContain('"10","","1"');
    expect(JSON.parse(reportJson(draft)).footer.signedBy).toBe("Koreksi");
    expect(JSON.parse(reportJson(draft)).canonical.document.signedBy).toBe(
      "Koreksi",
    );
  });
  it("reconciles row/vendor totals and capacity without fixed sample numbers", () => {
    const draft = structuredClone(SAMPLE_IMPORT.draft!);
    draft.production.totalTon = 100;
    draft.production.runningTimeHours = 2;
    draft.production.capacityTph = 50;
    expect(reportAnalytics(draft).capacityValid).toBe(true);
    draft.vendors[0]!.vehicles[0]!.hourly![0]!.retase = 20;
    expect(
      reportAnalytics(draft).discrepancies.some((x) => x.includes("DT 10")),
    ).toBe(true);
  });
});
