import { describe,it,expect } from 'vitest';
import type { CrusherReportDraft } from '@qc/contracts';
import { reportShiftHours,validateCrusherReport } from './validation';
const shift={code:'SHIFT_2',name:'2',startTime:'15:30',endTime:'22:30',active:true,crossesMidnight:false};
export const validDraft=():CrusherReportDraft=>({schemaVersion:'1.0',reportDate:'2026-08-18',shiftCode:'SHIFT_2',timezone:'Asia/Makassar',hours:reportShiftHours(shift),header:{day:'Selasa',crusherCode:null,operatorName:null},vendors:[{blockKey:'upper-left',vendorCode:'BATARA',vendorId:'00000000-0000-4000-8000-000000000001',retaseTotal:3,hourly:reportShiftHours(shift).map((hour,i)=>({hour,retase:i===0?3:0})),vehicles:[{rowIndex:1,dtNo:'24',retase:1,assignmentAaId:'00000000-0000-4000-8000-000000000002',reviewed:true},{rowIndex:2,dtNo:'24',retase:2,assignmentAaId:'00000000-0000-4000-8000-000000000002',reviewed:true}]}],production:{pileTon:7338,fillerTon:null,totalTon:7338,runningTimeHours:5.3,capacityTph:1384},pile:{baratPercent:20,timurPercent:25,totalPercent:45},notes:{raw:null},reportRetaseTotal:3});
describe('crusher report reconciliation',()=>{
  it('checks the OreVision hourly matrix without making legacy OCR rows incompatible',()=>{
    const d=validDraft();d.vendors[0]!.vehicles[0]!.hourly=d.hours.map((hour,i)=>({hour,retase:i===0?2:0}));
    expect(validateCrusherReport(d,shift)).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'ROW_HOURLY_TOTAL_MATCH',severity:'WARNING'}),
    ]));
    d.vendors[0]!.vehicles[0]!.hourly[0]!.retase=null;
    expect(validateCrusherReport(d,shift)).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'ROW_HOURLY_INCOMPLETE',severity:'WARNING'}),
    ]));
    expect(validateCrusherReport(validDraft(),shift)).toEqual([]);
  });
  it('keeps DT identity and row/vendor totals blocking while report total and hourly checks warn',()=>{
    const d=validDraft();
    d.vendors[0]!.vehicles[0]!.dtNo='';
    d.vendors[0]!.vehicles[0]!.hourly=d.hours.map((hour,i)=>({hour,retase:i===0?2:0}));
    d.vendors[0]!.retaseTotal=4;
    d.reportRetaseTotal=149;
    const issues=validateCrusherReport(d,shift);
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'DT_REQUIRED',severity:'BLOCKING'}),
      expect.objectContaining({code:'VENDOR_ROW_TOTAL_MATCH',severity:'BLOCKING'}),
      expect.objectContaining({code:'REPORT_RETASE_TOTAL_MATCH',severity:'WARNING'}),
      expect.objectContaining({code:'ROW_HOURLY_TOTAL_MATCH',severity:'WARNING'}),
    ]));
    expect(issues.filter(x=>x.code==='ROW_HOURLY_TOTAL_MATCH').every(x=>x.severity==='WARNING')).toBe(true);
  });
  it('preserves duplicate DT rows and keeps the printed shift columns separate from live boundaries',()=>{expect(reportShiftHours(shift)).toEqual([15,16,17,18,19,20,21,22]);expect(validateCrusherReport(validDraft(),shift)).toEqual([]);});
  it('blocks missing, inconsistent and unreviewed data',()=>{const d=validDraft();d.vendors[0]!.vehicles[0]!.retase=null;d.vendors[0]!.vehicles[0]!.reviewed=false;d.vendors[0]!.hourly[0]!.retase=null;expect(validateCrusherReport(d,shift).map(x=>x.code)).toEqual(expect.arrayContaining(['ROW_RETASE_REQUIRED','ROW_REVIEW_REQUIRED','VENDOR_ROW_TOTAL_MATCH','VENDOR_HOURLY_INCOMPLETE']));});
  it('requires actual mapping, not a vendor summary treated as AM data',()=>{const d=validDraft();d.vendors[0]!.vehicles[0]!.assignmentAaId=null;expect(validateCrusherReport(d,shift).some(x=>x.code==='AM_MAPPING_REQUIRED')).toBe(true);});
  it('checks totals, day/date, pile, capacity and bounds without changing the source',()=>{const d=validDraft();d.pile.totalPercent=101;d.production.capacityTph=1;d.header.day='Senin';d.reportRetaseTotal=9;const before=JSON.stringify(d);expect(validateCrusherReport(d,shift).map(x=>x.code)).toEqual(expect.arrayContaining(['PILE_PERCENT_RANGE','PILE_PERCENT_TOTAL_MATCH','CAPACITY_MATCH','HEADER_DAY_DATE_MISMATCH','REPORT_RETASE_TOTAL_MATCH']));expect(JSON.stringify(d)).toBe(before);});
  it('does not accept unsupported shift templates or duplicate source indexes',()=>{const d=validDraft();d.vendors[0]!.vehicles[1]!.rowIndex=1;expect(validateCrusherReport(d,{...shift,code:'SHIFT_3'}).map(x=>x.code)).toContain('REPORT_SHIFT_UNSUPPORTED');expect(validateCrusherReport(d,shift).map(x=>x.code)).toContain('ROW_INDEX_DUPLICATE');});
});
