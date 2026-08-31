export type ClayReportStatus='DRAFT'|'SUBMITTED'|'APPROVED'|'SUPERSEDED';
export type ClayColumnInputMode='MASTER'|'MANUAL'|'BUFFER';
export type ClayColumnStatus='PROVISIONAL'|'CONFIRMED'|'INACTIVE';
export type ClayOperationCategory='SHIFT_CHANGE'|'STOP'|'BREAKDOWN'|'MAINTENANCE'|'NOTE';

type ClayShiftWindow = {
  startTime: string;
  endTime: string;
  crossesMidnight: boolean;
};

const minuteOfDay = (time: string) =>
  Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Printed Clay rows follow the configured shift window, including partial hours. */
export function clayReportShiftHours(shift: ClayShiftWindow): number[] {
  const start = Math.floor(minuteOfDay(shift.startTime) / 60) * 60;
  const end =
    minuteOfDay(shift.endTime) + (shift.crossesMidnight ? 1440 : 0);
  const hours: number[] = [];
  for (let minute = start; minute < end; minute += 60)
    hours.push(Math.floor((minute % 1440) / 60));
  return hours;
}

/** Calendar-day offset for an hour inside an ordered Clay shift matrix. */
export function clayReportHourDayOffset(
  hours: readonly number[],
  hour: number,
): number {
  const position = hours.indexOf(hour);
  if (position < 0)
    throw new Error(`Hour ${hour} is not part of the Clay report matrix.`);
  let offset = 0;
  for (let index = 1; index <= position; index++)
    if (hours[index]! < hours[index - 1]!) offset++;
  return offset;
}
