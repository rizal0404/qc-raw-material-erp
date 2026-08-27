import { describe, expect, it } from 'vitest';
import { adjustCellDelta, currentShiftContext, downtimeMinutes, headerPatch, nextDisplayOrder, numberFields, shiftHours, shiftWindow, textFields, type HeaderDraft, type ShiftOption } from './clay-form-model';

const day: ShiftOption = { code: 'SHIFT_2', label: 'Shift II', startTime: '15:00:00', endTime: '23:00:00', crossesMidnight: false };
const night: ShiftOption = { code: 'SHIFT_3', label: 'Shift III', startTime: '23:00:00', endTime: '07:00:00', crossesMidnight: true };
const log = (startTime: string, endTime: string, category = 'BREAKDOWN' as 'BREAKDOWN' | 'NOTE' | 'STOP') => ({ startTime, endTime, category });

describe('paper-style Clay form calculations', () => {
  it('shows every hour, including empty hours, of the selected shift', () => {
    const rows = shiftHours('2026-08-18', day);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual({ hour: '15:00', eventAt: '2026-08-18T15:00:00+08:00', nextDay: false });
    expect(rows[7]?.hour).toBe('22:00');
    expect(shiftWindow(day).minutes).toBe(480);
  });
  it('uses the following calendar date for backfill after midnight', () => {
    const rows = shiftHours('2026-08-31', night);
    expect(rows).toHaveLength(8);
    expect(rows[1]).toEqual({ hour: '00:00', eventAt: '2026-09-01T00:00:00+08:00', nextDay: true });
    expect(rows[7]?.hour).toBe('06:00');
  });
  it('keeps a partial first hour timestamp within the shift', () => {
    expect(shiftHours('2026-08-18', { ...day, startTime: '15:30' })[0]?.eventAt).toBe('2026-08-18T15:30:00+08:00');
  });
  it('keeps the previous business date during the night shift', () => {
    expect(currentShiftContext([day, night], new Date('2026-09-01T01:10:00+08:00'))).toEqual({ operationDate: '2026-08-31', shiftCode: 'SHIFT_3', hour: '01:00' });
    expect(currentShiftContext([day, night], new Date('2026-08-31T23:00:00+08:00')).operationDate).toBe('2026-08-31');
  });
  it('calculates the reference downtime as 26 minutes', () => {
    expect(downtimeMinutes([log('17:26', '17:35'), log('20:43', '21:00', 'STOP')], day)).toBe(26);
  });
  it('counts overlapping downtime once and excludes ordinary notes', () => {
    expect(downtimeMinutes([log('17:00', '17:30'), log('17:15', '17:45'), log('18:00', '19:00', 'NOTE')], day)).toBe(45);
  });
  it('clips downtime to the shift and handles midnight', () => {
    expect(downtimeMinutes([log('22:45', '23:15'), log('23:55', '00:10'), log('06:55', '07:30')], night)).toBe(35);
    expect(downtimeMinutes([log('14:50', '15:10'), log('23:30', '23:40')], day)).toBe(10);
    expect(downtimeMinutes([log('', ''), log('18:00', '18:00')], day)).toBe(0);
  });
  it('parses Indonesian decimals and preserves cleared fields as null', () => {
    const header = Object.fromEntries([...numberFields, ...textFields].map(key => [key, ''])) as HeaderDraft;
    expect(headerPatch({ ...header, productionTonnage: '1733', capacityTph: '314,51', operatorNameSnapshot: ' Awaluddin ' })).toMatchObject({ productionTonnage: 1733, capacityTph: 314.51, stockPercent: null, operatorNameSnapshot: 'Awaluddin', note: null });
    expect(() => headerPatch({ ...header, runningMinutes: '5,5' })).toThrow();
    expect(() => headerPatch({ ...header, stockPercent: '101' })).toThrow();
    expect(() => headerPatch({ ...header, productionTonnage: 'abc' })).toThrow();
  });
  it('prevents negative trips and oversized unsaved batches', () => {
    expect(adjustCellDelta(13, 1, -1)).toBe(0);
    expect(adjustCellDelta(13, 0, -1)).toBe(-1);
    expect(() => adjustCellDelta(0, 0, -1)).toThrow('kurang dari nol');
    expect(() => adjustCellDelta(0, 250, 1)).toThrow('250 trip');
  });
  it('finds a free display order instead of overwriting an existing row', () => {
    expect(nextDisplayOrder([{ displayOrder: 0 }, { displayOrder: 2 }])).toBe(1);
    expect(() => nextDisplayOrder(Array.from({ length: 100 }, (_, displayOrder) => ({ displayOrder })))).toThrow();
  });
});
