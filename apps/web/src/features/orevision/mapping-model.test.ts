import { describe, expect, it } from "vitest";
import {
  defaultRowAssignment,
  equipmentMatches,
  matchingEquipment,
  rowAssignments,
  rowWithEquipment,
} from "./mapping-model";

const aa = (id: string, unitNo: string, aliases: string[] = []) => ({
  id,
  code: `vendor:AA:${unitNo}`,
  vendorId: "vendor",
  type: "AA" as const,
  unitNo,
  aliases,
  active: true,
  materialKinds: ["LS" as const],
  label: unitNo,
});
const row = {
  rowIndex: 1,
  dtNo: "DT 007",
  equipmentId: null,
  retase: 2,
  assignmentAaId: null,
  reviewed: false,
};
describe("OreVision DT mapping model", () => {
  it("normalizes prefixes, zeros and aliases without merging physical rows", () => {
    const items = [aa("aa-7", "7", ["DT-0007"]), aa("aa-8", "08")];
    expect(equipmentMatches(row.dtNo, items[0]!)).toBe(true);
    expect(matchingEquipment(row, items, "vendor").map((x) => x.id)).toEqual([
      "aa-7",
    ]);
    expect([row, { ...row, rowIndex: 2 }]).toHaveLength(2);
  });
  it("does not auto-match ambiguous equipment and restricts assignments to active vendor routes", () => {
    const items = [aa("one", "7"), aa("two", "007")];
    expect(matchingEquipment(row, items, "vendor")).toHaveLength(2);
    const assignments = [
      {
        id: "route-one",
        vendorId: "vendor",
        status: "ACTIVE",
        amUnitNo: "AM-1",
        sourceName: "B9",
        validFrom: null,
        validTo: null,
        aa: [{ aaId: "one", assignmentAaId: "assignment", unitNo: "7" }],
      },
      {
        id: "route-two",
        vendorId: "vendor",
        status: "ACTIVE",
        amUnitNo: "AM-2",
        sourceName: "B10",
        validFrom: null,
        validTo: null,
        aa: [
          { aaId: "two", assignmentAaId: "assignment-two", unitNo: "007" },
        ],
      },
    ] as any;
    expect(rowAssignments(row, "vendor", assignments, items)).toHaveLength(2);
    expect(rowAssignments(row, "other", assignments, items)).toHaveLength(0);
    expect(defaultRowAssignment(row, "vendor", assignments, items)).toBeNull();
  });
  it("defaults a uniquely matched vendor DT to its submitted shift-report AM", () => {
    const items = [aa("aa-7", "7", ["DT-0007"])];
    const assignments = [
      {
        id: "route",
        vendorId: "vendor",
        status: "ACTIVE",
        assignmentOrigin: "SHIFT_REPORT",
        amUnitNo: "07",
        sourceName: "B9",
        validFrom: null,
        validTo: null,
        aa: [
          { aaId: "aa-7", assignmentAaId: "assignment", unitNo: "7" },
        ],
      },
    ] as any;
    expect(defaultRowAssignment(row, "vendor", assignments, items)).toEqual({
      id: "assignment",
      aaId: "aa-7",
      label: "Terhubung ke AM no '07' · B9",
    });
  });
  it("stores the canonical equipment id and only corrects a genuinely different number", () => {
    const item = aa("aa-7", "7", ["DT 007"]);
    expect(rowWithEquipment(row, item)).toMatchObject({
      dtNo: "DT 007",
      equipmentId: "aa-7",
      assignmentAaId: null,
      reviewed: false,
    });
    expect(rowWithEquipment({ ...row, dtNo: "99" }, item).dtNo).toBe("7");
  });
});
