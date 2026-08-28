import type { FleetSummary, ShiftAssignmentInput } from '@qc/contracts';
import type { ShiftRecord } from '../master/types';

export interface TimelineAssignment {
  amId: string;
  aaIds: string[];
  crusherId?: string | null | undefined;
  validFrom: string | null;
  validTo: string | null;
}

export function fleetDifference(summary: FleetSummary): number {
  return summary.total - (summary.operating + summary.standby + summary.breakdown + summary.repair + summary.other);
}

export function isFleetBalanced(summary: FleetSummary): boolean {
  return fleetDifference(summary) === 0;
}

function minuteOfDay(value: string): number {
  const [h, m] = value.slice(0, 5).split(':').map(Number);
  if (h === undefined || m === undefined || !Number.isInteger(h) || !Number.isInteger(m)) throw new Error(`Format waktu tidak valid: ${value}`);
  return h * 60 + m;
}

function normalizedPoint(value: string, shift: ShiftRecord): number {
  const start = minuteOfDay(shift.startTime);
  let point = minuteOfDay(value);
  if (shift.crossesMidnight && point < start) point += 1440;
  return point;
}

export function shiftInterval(shift: ShiftRecord): [number, number] {
  const start = minuteOfDay(shift.startTime);
  let end = minuteOfDay(shift.endTime);
  if (shift.crossesMidnight && end <= start) end += 1440;
  return [start, end];
}

export function assignmentInterval(input: Pick<ShiftAssignmentInput, 'validFrom' | 'validTo'>, shift: ShiftRecord): [number, number] {
  const [shiftStart, shiftEnd] = shiftInterval(shift);
  if (!input.validFrom || !input.validTo) return [shiftStart, shiftEnd];
  const from = normalizedPoint(input.validFrom, shift);
  const to = normalizedPoint(input.validTo, shift);
  if (from < shiftStart || from > shiftEnd || to < shiftStart || to > shiftEnd || to <= from) {
    throw new Error(`Assignment ${input.validFrom}-${input.validTo} berada di luar window ${shift.startTime}-${shift.endTime}.`);
  }
  return [from, to];
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

export interface AssignmentConflict {
  type: 'AA_OVERLAP';
  equipmentId: string;
  firstIndex: number;
  secondIndex: number;
}

export function findAssignmentConflicts(assignments: TimelineAssignment[], shift: ShiftRecord): AssignmentConflict[] {
  const out: AssignmentConflict[] = [];
  const intervals = assignments.map((a) => assignmentInterval(a, shift));
  for (let i = 0; i < assignments.length; i += 1) {
    for (let j = i + 1; j < assignments.length; j += 1) {
      if (!overlaps(intervals[i]!, intervals[j]!)) continue;
      const left = assignments[i]!;
      const right = assignments[j]!;
      // One AM may feed multiple crusher routes concurrently. AA overlap is only
      // ambiguous inside the same crusher; cross-crusher routes support rerouting.
      if (left.crusherId && right.crusherId && left.crusherId !== right.crusherId) continue;
      const rightSet = new Set(right.aaIds);
      for (const aaId of left.aaIds) {
        if (rightSet.has(aaId)) out.push({ type: 'AA_OVERLAP', equipmentId: aaId, firstIndex: i, secondIndex: j });
      }
    }
  }
  return out;
}
