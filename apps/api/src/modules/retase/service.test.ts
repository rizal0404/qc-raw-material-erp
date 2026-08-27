import { describe, expect, it } from 'vitest';
import type { AuthPrincipal, CounterAssignmentRecord, OperationalAssignmentWriteRecord, RetaseEventRecord } from '@qc/domain';
import { createRetaseService } from './service';

const principal:AuthPrincipal={sessionId:'s',userId:'00000000-0000-4000-8000-000000000001',username:'operator',displayName:'Operator',role:'CRUSHER_OPERATOR',vendorId:null,status:'ACTIVE',crusherIds:['00000000-0000-4000-8000-000000000010'],lastLoginAt:null,sessionExpiresAt:new Date('2026-08-21T00:00:00Z'),sessionLastSeenAt:new Date('2026-08-20T00:00:00Z')};
const event:RetaseEventRecord={id:'00000000-0000-4000-8000-000000000100',requestId:'00000000-0000-4000-8000-000000000200',operationDate:'2026-08-20',eventTs:new Date('2026-08-20T01:00:00Z'),shiftCode:'SHIFT_1',crusherId:principal.crusherIds[0]!,crusherCode:'CR_LS_5',crusherName:'CR LS 5',vendorId:null,vendorName:null,reportId:null,reportVersion:null,assignmentId:null,assignmentAaId:null,assignmentOrigin:null,clayReportId:null,clayReportColumnId:null,entrySource:'LIVE_COUNTER',entryBatchId:null,amId:null,aaId:null,sourceId:null,sourceCode:null,pileId:null,pileCode:null,pileName:null,blockSnapshot:null,materialKind:null,materialCategory:null,vendorNameSnapshot:null,sourceNameSnapshot:null,amUnitNoSnapshot:null,aaUnitNoSnapshot:'112',delta:1,eventType:'DUMP',status:'EXCEPTION_UNASSIGNED',createdBy:principal.userId,createdByName:'Operator',reversesEventId:null,reason:'unit pengganti',clientTs:null};
const vendorId='00000000-0000-4000-8000-000000000020',amId='00000000-0000-4000-8000-000000000021',aaId='00000000-0000-4000-8000-000000000022',clayCrusherId='00000000-0000-4000-8000-000000000023';

function master(){return {listShifts:async()=>[
  {code:'SHIFT_1',name:'Shift 1',startTime:'07:30',endTime:'15:30',crossesMidnight:false,active:true},
  {code:'SHIFT_2',name:'Shift 2',startTime:'15:30',endTime:'22:30',crossesMidnight:false,active:true},
  {code:'SHIFT_3',name:'Shift 3',startTime:'22:30',endTime:'07:30',crossesMidnight:true,active:true},
],findCrusherById:async()=>({id:principal.crusherIds[0],code:'CR_LS_5',name:'CR LS 5',materialKind:'LS',plantId:null,plantCode:null,plantName:null,active:true,createdAt:new Date(),updatedAt:new Date()}),findVendorById:async()=>null,findEquipmentById:async()=>null,findEquipmentByBusinessKey:async()=>null} as any;}

describe('RetaseService',()=>{
  it('returns existing event for duplicate request_id without second insert',async()=>{
    let inserts=0;
    const repo={findByRequestId:async()=>event,appendEvent:async()=>{inserts+=1;return event;}} as any;
    const svc=createRetaseService(repo,master(),{now:()=>new Date('2026-08-20T01:00:00Z')});
    const result=await svc.record(principal,{requestId:event.requestId,operationDate:'2026-08-20',shiftCode:'SHIFT_1',crusherId:principal.crusherIds[0]!,unlistedUnitNo:'112',reason:'unit pengganti'});
    expect(result.idempotent).toBe(true);expect(inserts).toBe(0);
  });

  it('rejects request_id reuse for a different logical event',async()=>{
    const repo={findByRequestId:async()=>event} as any;
    const svc=createRetaseService(repo,master(),{now:()=>new Date('2026-08-20T01:00:00Z')});
    await expect(svc.record(principal,{requestId:event.requestId,operationDate:'2026-08-20',shiftCode:'SHIFT_1',crusherId:principal.crusherIds[0]!,unlistedUnitNo:'999',reason:'unit lain'})).rejects.toMatchObject({code:'IDEMPOTENCY_KEY_REUSED'});
  });

  it('rejects write when selected business context is not current',async()=>{
    const repo={findByRequestId:async()=>null} as any;
    const svc=createRetaseService(repo,master(),{now:()=>new Date('2026-08-20T01:00:00Z')});
    await expect(svc.record(principal,{requestId:'00000000-0000-4000-8000-000000000201',operationDate:'2026-08-19',shiftCode:'SHIFT_1',crusherId:principal.crusherIds[0]!,unlistedUnitNo:'112',reason:'unit pengganti'})).rejects.toMatchObject({code:'COUNTER_CONTEXT_NOT_CURRENT'});
  });

  it('allows a vendor to activate a Clay assignment without a submitted report or source',async()=>{
    const vendorPrincipal:AuthPrincipal={...principal,role:'VENDOR',vendorId,crusherIds:[]};let written:OperationalAssignmentWriteRecord|null=null;
    const masterRepo={...master(),findVendorById:async()=>({id:vendorId,code:'V001',name:'Vendor Clay',aliases:[],contactEmail:null,materialKinds:['CL'],active:true,createdAt:new Date(),updatedAt:new Date()}),findCrusherById:async()=>({id:clayCrusherId,code:'CR_CL_1',name:'Crusher Clay 1',materialKind:'CL',plantId:null,plantCode:null,plantName:null,active:true,createdAt:new Date(),updatedAt:new Date()}),findPileById:async()=>null,findSourceById:async()=>null,findEquipmentById:async(id:string)=>id===amId?({id:amId,vendorId,vendorCode:'V001',vendorName:'Vendor Clay',type:'AM',unitNo:'AM-01',brand:null,model:null,aliases:[],materialKinds:['CL'],active:true,createdAt:new Date(),updatedAt:new Date()}):({id:aaId,vendorId,vendorCode:'V001',vendorName:'Vendor Clay',type:'AA',unitNo:'AA-01',brand:null,model:null,aliases:[],materialKinds:['CL'],active:true,createdAt:new Date(),updatedAt:new Date()})} as any;
    const created:CounterAssignmentRecord={id:'00000000-0000-4000-8000-000000000024',assignmentOrigin:'OPERATIONAL',operationDate:'2026-08-20',shiftCode:'SHIFT_1',reportId:null,reportVersion:null,vendorId,vendorCode:'V001',vendorName:'Vendor Clay',amId,amUnitNo:'AM-01',sourceId:null,sourceCode:null,sourceName:null,blockSnapshot:null,materialKind:'CL',materialCategory:'CLAY',crusherId:clayCrusherId,crusherCode:'CR_CL_1',crusherName:'Crusher Clay 1',plantId:null,plantCode:null,plantName:null,pileId:null,pileCode:null,pileName:null,validFrom:null,validTo:null,status:'ACTIVE',note:null,createdBy:vendorPrincipal.userId,createdByName:vendorPrincipal.displayName,updatedAt:new Date(),aa:[{assignmentAaId:'00000000-0000-4000-8000-000000000025',aaId,unitNo:'AA-01',brand:null,model:null,confirmedCount:0,lastEventAt:null}]};
    const repo={listAssignmentCandidatesForAa:async()=>[],createOperationalAssignment:async(input:OperationalAssignmentWriteRecord)=>{written=input;return created;},appendAudit:async()=>undefined} as any;
    const svc=createRetaseService(repo,masterRepo,{now:()=>new Date('2026-08-20T01:00:00Z')});const result=await svc.createOperational(vendorPrincipal,{operationDate:'2026-08-20',shiftCode:'SHIFT_1',amId,crusherId:clayCrusherId,sourceId:null,aaIds:[aaId]});
    expect(result.assignmentOrigin).toBe('OPERATIONAL');expect(written).toMatchObject({vendorId,materialKind:'CL',materialCategory:'CLAY',sourceId:null});
  });
});
