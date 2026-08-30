import {
  IsoDateSchema,
  ReconciliationListQuerySchema,
  ShiftCodeSchema,
  type ShiftCode,
} from "@qc/contracts";

export function validateReportHandoff(search: Record<string, unknown>): {
  operationDate?: string;
  shiftCode?: ShiftCode;
  crusherId?: string;
} {
  const date = IsoDateSchema.safeParse(search.operationDate);
  const shift = ShiftCodeSchema.safeParse(search.shiftCode);
  const crusher = ReconciliationListQuerySchema.shape.crusherId.safeParse(
    search.crusherId,
  );
  return {
    ...(date.success ? { operationDate: date.data } : {}),
    ...(shift.success ? { shiftCode: shift.data } : {}),
    ...(crusher.success && crusher.data ? { crusherId: crusher.data } : {}),
  };
}
