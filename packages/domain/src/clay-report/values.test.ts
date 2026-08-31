import { describe, expect, it } from "vitest";
import {
  clayReportHourDayOffset,
  clayReportShiftHours,
} from "./values";

describe("Clay report shift matrix", () => {
  it("keeps the printed partial-hour rows for a daytime shift", () => {
    expect(
      clayReportShiftHours({
        startTime: "15:30",
        endTime: "22:30",
        crossesMidnight: false,
      }),
    ).toEqual([15, 16, 17, 18, 19, 20, 21, 22]);
  });

  it("moves post-midnight Shift III events to the next calendar day", () => {
    const hours = clayReportShiftHours({
      startTime: "22:30",
      endTime: "07:30",
      crossesMidnight: true,
    });
    expect(hours).toEqual([22, 23, 0, 1, 2, 3, 4, 5, 6, 7]);
    expect(clayReportHourDayOffset(hours, 23)).toBe(0);
    expect(clayReportHourDayOffset(hours, 0)).toBe(1);
    expect(clayReportHourDayOffset(hours, 7)).toBe(1);
  });
});
