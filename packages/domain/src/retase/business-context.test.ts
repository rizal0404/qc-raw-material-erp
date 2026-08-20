import { describe, expect, it } from 'vitest';
import type { ShiftRecord } from '../master/types';
import { assignmentActiveAtLocalMinute, businessContextAt } from './business-context';

const shifts:ShiftRecord[]=[
  {code:'SHIFT_1',name:'Shift 1',startTime:'07:30',endTime:'15:30',crossesMidnight:false,active:true},
  {code:'SHIFT_2',name:'Shift 2',startTime:'15:30',endTime:'22:30',crossesMidnight:false,active:true},
  {code:'SHIFT_3',name:'Shift 3',startTime:'22:30',endTime:'07:30',crossesMidnight:true,active:true},
];

describe('retase business context',()=>{
  it('uses previous operation date after midnight in shift 3',()=>{
    const ctx=businessContextAt(new Date('2026-08-20T18:15:00.000Z'),shifts); // 02:15 WITA 21 Aug
    expect(ctx.localDate).toBe('2026-08-21');
    expect(ctx.operationDate).toBe('2026-08-20');
    expect(ctx.shiftCode).toBe('SHIFT_3');
  });
  it('switches exactly at shift boundary',()=>{
    expect(businessContextAt(new Date('2026-08-19T23:30:00.000Z'),shifts).shiftCode).toBe('SHIFT_1'); // 07:30 WITA
    expect(businessContextAt(new Date('2026-08-20T07:30:00.000Z'),shifts).shiftCode).toBe('SHIFT_2'); // 15:30 WITA
  });
  it('evaluates overnight assignment window',()=>{
    const shift=shifts[2]!;
    expect(assignmentActiveAtLocalMinute('23:00','01:00',shift,23*60+30)).toBe(true);
    expect(assignmentActiveAtLocalMinute('23:00','01:00',shift,30)).toBe(true);
    expect(assignmentActiveAtLocalMinute('23:00','01:00',shift,2*60)).toBe(false);
  });
});
