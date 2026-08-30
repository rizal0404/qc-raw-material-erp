import {
  normalizeReportDt,
  type CounterAssignment,
  type CrusherReportDraft,
} from "@qc/contracts";
import type { EquipmentLookupItem } from "../vendor/vendor-api";

export type ReportVehicle =
  CrusherReportDraft["vendors"][number]["vehicles"][number];
export function equipmentMatches(dtNo: string, equipment: EquipmentLookupItem) {
  const key = normalizeReportDt(dtNo);
  return (
    !!key &&
    [equipment.unitNo, ...(equipment.aliases ?? [])].some(
      (value) => normalizeReportDt(value) === key,
    )
  );
}
export function matchingEquipment(
  row: ReportVehicle,
  items: EquipmentLookupItem[],
  vendorId: string | null,
) {
  return items.filter(
    (item) =>
      item.active &&
      item.type === "AA" &&
      item.vendorId === vendorId &&
      equipmentMatches(row.dtNo, item),
  );
}
export function rowAssignments(
  row: ReportVehicle,
  vendorId: string | null,
  assignments: CounterAssignment[],
  equipment: EquipmentLookupItem[],
) {
  const matches = matchingEquipment(row, equipment, vendorId);
  const choices = assignments
    .filter((a) => a.vendorId === vendorId && a.status === "ACTIVE")
    .flatMap((a) =>
      a.aa
        .filter((aa) =>
          row.equipmentId
            ? aa.aaId === row.equipmentId
            : matches.length
              ? matches.some((e) => e.id === aa.aaId)
              : normalizeReportDt(aa.unitNo) === normalizeReportDt(row.dtNo),
        )
        .map((aa) => ({
          id: aa.assignmentAaId,
          aaId: aa.aaId,
          label: `Terhubung ke AM no '${a.amUnitNo}' · ${a.sourceName ?? a.blockSnapshot ?? "source —"}${a.validFrom ? ` · ${a.validFrom}–${a.validTo}` : ""}`,
        })),
    );
  return choices.filter(
    (choice, index) =>
      choices.findIndex((candidate) => candidate.id === choice.id) === index,
  );
}
export function defaultRowAssignment(
  row: ReportVehicle,
  vendorId: string | null,
  assignments: CounterAssignment[],
  equipment: EquipmentLookupItem[],
) {
  if (row.assignmentAaId || !vendorId || !row.dtNo.trim()) return null;
  const choices = rowAssignments(row, vendorId, assignments, equipment);
  return choices.length === 1 ? choices[0]! : null;
}
export function rowWithEquipment(
  row: ReportVehicle,
  equipment: EquipmentLookupItem,
): ReportVehicle {
  return {
    ...row,
    equipmentId: equipment.id,
    dtNo: equipmentMatches(row.dtNo, equipment) ? row.dtNo : equipment.unitNo,
    assignmentAaId: null,
    reviewed: false,
  };
}
