import { describe, expect, it } from 'vitest';
import { assignmentInterval, findAssignmentConflicts, fleetDifference, isFleetBalanced } from './validation';
import type { ShiftRecord } from '../master/types';

const shift1: ShiftRecord = { code:'SHIFT_1',name:'Shift 1',startTime:'07:30',endTime:'15:30',crossesMidnight:false,active:true };
const shift3: ShiftRecord = { code:'SHIFT_3',name:'Shift 3',startTime:'22:30',endTime:'07:30',crossesMidnight:true,active:true };

describe('vendor shift validation',()=>{
  it('checks fleet balance',()=>{
    const ok={total:18,operating:10,standby:2,breakdown:2,repair:4,other:0};
    expect(isFleetBalanced(ok)).toBe(true);
    expect(fleetDifference({...ok,total:19})).toBe(1);
  });

  it('normalizes overnight assignment into one business timeline',()=>{
    expect(assignmentInterval({validFrom:'23:00',validTo:'01:00'},shift3)).toEqual([1380,1500]);
    expect(assignmentInterval({validFrom:null,validTo:null},shift3)).toEqual([1350,1890]);
  });

  it('allows one AM to serve multiple crusher routes concurrently',()=>{
    const conflicts=findAssignmentConflicts([
      {amId:'am-1',crusherId:'crusher-1',aaIds:['aa-1','aa-2'],validFrom:'08:00',validTo:'10:00'},
      {amId:'am-1',crusherId:'crusher-2',aaIds:['aa-2','aa-3'],validFrom:'09:00',validTo:'11:00'},
    ],shift1);
    expect(conflicts).toEqual([]);
  });

  it('rejects the same AA twice in an overlapping route to one crusher',()=>{
    const conflicts=findAssignmentConflicts([
      {amId:'am-1',crusherId:'crusher-1',aaIds:['aa-2'],validFrom:'08:00',validTo:'10:00'},
      {amId:'am-2',crusherId:'crusher-1',aaIds:['aa-2'],validFrom:'09:00',validTo:'11:00'},
    ],shift1);
    expect(conflicts.map(x=>x.type)).toEqual(['AA_OVERLAP']);
  });

  it('allows sequential reassignment at touching boundary',()=>{
    const conflicts=findAssignmentConflicts([
      {amId:'am-1',crusherId:'crusher-1',aaIds:['aa-1'],validFrom:'08:00',validTo:'10:00'},
      {amId:'am-1',crusherId:'crusher-1',aaIds:['aa-1'],validFrom:'10:00',validTo:'12:00'},
    ],shift1);
    expect(conflicts).toEqual([]);
  });

  it('treats an unspecified crusher as overlapping every destination for the same AA', () => {
    expect(findAssignmentConflicts([
      { amId: 'am-1', crusherId: null, aaIds: ['aa-1'], validFrom: null, validTo: null },
      { amId: 'am-2', crusherId: 'crusher-2', aaIds: ['aa-1'], validFrom: null, validTo: null },
    ], shift1).map(x => x.type)).toEqual(['AA_OVERLAP']);
  });

});
