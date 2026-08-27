import { PatchClayReportRequestSchema, type ClayReport, type MasterLookupResponse } from '@qc/contracts';

export type ShiftOption = MasterLookupResponse['shifts'][number];
export type ClayColumn = ClayReport['columns'][number];
export type OperationLog = Pick<ClayReport['operationLogs'][number], 'startTime' | 'endTime' | 'category'>;
export const numberFields = ['productionTonnage', 'runningMinutes', 'totalRunningMinutes', 'capacityTph', 'stockPercent', 'sm', 'sio2', 'h2o', 'attendancePresent', 'attendanceSick', 'attendanceOvertime', 'attendancePermission', 'attendanceLeave'] as const;
export const textFields = ['operatorNameSnapshot', 'pickupLocation', 'weather', 'pileFilling', 'note'] as const;
export type HeaderDraft = Record<(typeof numberFields)[number] | (typeof textFields)[number], string>;

export function headerFromReport(report: ClayReport): HeaderDraft {
  return Object.fromEntries([...numberFields, ...textFields].map(key => [key, report[key]?.toString() ?? ''])) as HeaderDraft;
}

export function headerPatch(header: HeaderDraft) {
  const values: Record<string, string | number | null> = {};
  for (const key of textFields) values[key] = header[key].trim() || null;
  for (const key of numberFields) {
    const raw = header[key].trim();
    values[key] = raw === '' ? null : Number(raw.replace(',', '.'));
  }
  return PatchClayReportRequestSchema.parse(values);
}

export const minuteOfDay = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const shiftLabels: Record<string, string> = { SHIFT_1: 'Shift I', SHIFT_2: 'Shift II', SHIFT_3: 'Shift III' };
export const shiftLabel = (code: string) => shiftLabels[code] ?? code;
export const formatNumber = (value: number, digits = 1) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(value);
export const formatDate = (date: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'full', timeZone: 'Asia/Makassar' }).format(new Date(`${date}T12:00:00+08:00`));
export const formatTime = (value: string) => new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' }).format(new Date(value));
export const columnLabel = (column: ClayColumn) => [column.headerPrimary, column.headerSecondary].filter(Boolean).join(' ');
export const cellKey = (columnId: string, hour: string) => `${columnId}|${hour}`;
export const addDate = (date: string, days: number) => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export function shiftWindow(shift: ShiftOption) {
  const start = minuteOfDay(shift.startTime);
  const end = minuteOfDay(shift.endTime) + (shift.crossesMidnight ? 1440 : 0);
  return { start, end, minutes: Math.max(0, end - start) };
}

export function shiftHours(date: string, shift: ShiftOption) {
  const { start, end } = shiftWindow(shift);
  const rows: { hour: string; eventAt: string; nextDay: boolean }[] = [];
  for (let minute = Math.floor(start / 60) * 60; minute < end; minute += 60) {
    const hour = `${String(Math.floor((minute % 1440) / 60)).padStart(2, '0')}:00`;
    // A partial first hour is recorded at the shift start, within its business context.
    const eventMinute = Math.max(start, minute);
    const eventTime = `${String(Math.floor((eventMinute % 1440) / 60)).padStart(2, '0')}:${String(eventMinute % 60).padStart(2, '0')}`;
    rows.push({ hour, eventAt: `${addDate(date, Math.floor(eventMinute / 1440))}T${eventTime}:00+08:00`, nextDay: minute >= 1440 });
  }
  return rows;
}

export function currentShiftContext(shifts: ShiftOption[], now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (name: string) => parts.find(x => x.type === name)?.value ?? '';
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const minute = Number(get('hour')) * 60 + Number(get('minute'));
  const shift = shifts.find(x => x.crossesMidnight ? minute >= minuteOfDay(x.startTime) || minute < minuteOfDay(x.endTime) : minute >= minuteOfDay(x.startTime) && minute < minuteOfDay(x.endTime));
  return { operationDate: shift?.crossesMidnight && minute < minuteOfDay(shift.endTime) ? addDate(date, -1) : date, shiftCode: shift?.code ?? '', hour: `${get('hour')}:00` };
}

/** Only downtime categories count; overlapping intervals count once and stay within the shift. */
export function downtimeMinutes(logs: OperationLog[], shift: ShiftOption): number {
  const { start, end } = shiftWindow(shift);
  const ranges: [number, number][] = [];
  for (const log of logs) {
    if (!['STOP', 'BREAKDOWN', 'MAINTENANCE'].includes(log.category) || !log.startTime || !log.endTime) continue;
    let from = minuteOfDay(log.startTime), to = minuteOfDay(log.endTime);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from === to) continue;
    if (to < from) to += 1440;
    // Include both possible calendar days, then clip to the selected shift.
    for (const offset of [-1440, 0, 1440]) {
      const left = Math.max(start, from + offset), right = Math.min(end, to + offset);
      if (right > left) ranges.push([left, right]);
    }
  }
  ranges.sort((a, b) => a[0] - b[0]);
  let total = 0, right = -Infinity;
  for (const [from, to] of ranges) { total += Math.max(0, to - Math.max(from, right)); right = Math.max(right, to); }
  return total;
}

export function nextDisplayOrder(items: { displayOrder: number }[]) {
  const used = new Set(items.map(x => x.displayOrder));
  for (let order = 0; order < 100; order++) if (!used.has(order)) return order;
  throw new Error('Maksimum 100 baris tercapai.');
}

export function adjustCellDelta(existing: number, pending: number, change: number) {
  const next = pending + change;
  if (existing + next < 0) throw new Error('Jumlah trip tidak boleh kurang dari nol.');
  if (Math.abs(next) > 250) throw new Error('Simpan draft sebelum menambah lebih dari 250 trip pada satu sel.');
  return next;
}
