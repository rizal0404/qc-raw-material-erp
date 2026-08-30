import { describe, expect, it } from "vitest";
import { validateReportHandoff } from "./report-handoff";
describe("photo report handoff search", () => {
  it("passes only validated reconciliation context", () => {
    expect(
      validateReportHandoff({
        operationDate: "2026-08-28",
        shiftCode: "SHIFT_3",
        crusherId: "3266e4a5-dc3f-4719-89df-f1a1b10a06ea",
        junk: "x",
      }),
    ).toEqual({
      operationDate: "2026-08-28",
      shiftCode: "SHIFT_3",
      crusherId: "3266e4a5-dc3f-4719-89df-f1a1b10a06ea",
    });
    expect(
      validateReportHandoff({
        operationDate: "28/08/2026",
        shiftCode: "SHIFT_4",
        crusherId: "bad",
      }),
    ).toEqual({});
  });
});
