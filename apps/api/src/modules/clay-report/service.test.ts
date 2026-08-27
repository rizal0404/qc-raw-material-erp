import { describe,expect,it } from 'vitest';
import type { AuthPrincipal,ClayColumnRecord,ClayReportRecord } from '@qc/domain';
import { createClayReportService } from './service';

const crusherId='10000000-0000-4000-8000-000000000001';
const reportId='20000000-0000-4000-8000-000000000001';
const operator:AuthPrincipal={sessionId:'s',userId:'30000000-0000-4000-8000-000000000001',username:'op',displayName:'Operator Clay',role:'CRUSHER_OPERATOR',vendorId:null,status:'ACTIVE',crusherIds:[crusherId],lastLoginAt:null,sessionExpiresAt:new Date(Date.now()+60_000),sessionLastSeenAt:new Date()};
const qc:AuthPrincipal={...operator,userId:'30000000-0000-4000-8000-000000000002',username:'qc',displayName:'QC',role:'QC_ANALYST',crusherIds:[]};
const now=new Date('2026-08-26T08:00:00Z');
function baseReport():ClayReportRecord{return{id:reportId,operationDate:'2026-08-26',shiftCode:'SHIFT_2',crusherId,crusherCode:'CC5',crusherName:'Clay Crusher 5',version:1,status:'DRAFT',operatorUserId:operator.userId,operatorNameSnapshot:operator.displayName,productionTonnage:null,runningMinutes:null,totalRunningMinutes:null,capacityTph:null,stockPercent:null,pickupLocation:null,weather:null,pileFilling:null,sm:null,sio2:null,h2o:null,attendancePresent:null,attendanceSick:null,attendanceOvertime:null,attendancePermission:null,attendanceLeave:null,note:null,createdBy:operator.userId,updatedBy:null,submittedBy:null,submittedAt:null,approvedBy:null,approvedAt:null,createdAt:now,updatedAt:now};}
function setup(){let report:ClayReportRecord|null=null;const columns:ClayColumnRecord[]=[];const repository={
  findCurrent:async()=>report,findReport:async()=>report,createReport:async()=>{report=baseReport();return report;},
  updateReport:async(_id:string,patch:Partial<ClayReportRecord>)=>{report=report?{...report,...patch,updatedAt:now}:null;return report;},
  listColumns:async()=>columns,findColumn:async(id:string)=>columns.find(x=>x.id===id)??null,
  createColumn:async(input:Omit<ClayColumnRecord,'id'|'createdAt'|'updatedAt'|'updatedBy'>)=>{const row={...input,id:'40000000-0000-4000-8000-000000000001',updatedBy:null,createdAt:now,updatedAt:now};columns.push(row);return row;},
  updateColumn:async(id:string,patch:Partial<ClayColumnRecord>)=>{const index=columns.findIndex(x=>x.id===id);if(index<0)return null;columns[index]={...columns[index]!,...patch,updatedAt:now};return columns[index]!;},
  listOperationLogs:async()=>[],listHourly:async()=>[],appendAudit:async()=>undefined,
  createOperationLog:async()=>{throw new Error('unused');},appendHourly:async()=>undefined,
  } as any;
  const master={findCrusherById:async()=>({id:crusherId,code:'CC5',name:'Clay Crusher 5',materialKind:'CL',plantId:null,plantCode:null,plantName:null,active:true,createdAt:now,updatedAt:now}),findVendorById:async()=>null,findSourceById:async()=>null,findPileById:async()=>null} as any;
  return{service:createClayReportService(repository,master),columns,getReport:()=>report};
}

describe('ClayReportService',()=>{
  it('allows operator manual dynamic header without Vendor Shift Report and marks it provisional',async()=>{const x=setup();const report=await x.service.ensure(operator,{operationDate:'2026-08-26',shiftCode:'SHIFT_2',crusherId});await x.service.createColumn(operator,report.id,{displayOrder:5,headerPrimary:'TOP',headerSecondary:'BONTOA',inputMode:'MANUAL',vendorNameSnapshot:'Vendor tulisan tangan',sourceNameSnapshot:'Bontoa'},'req');expect(x.columns[0]).toMatchObject({status:'PROVISIONAL',vendorId:null,sourceId:null,headerPrimary:'TOP',headerSecondary:'BONTOA'});});
  it('requires QC confirmation before submit',async()=>{const x=setup();const report=await x.service.ensure(operator,{operationDate:'2026-08-26',shiftCode:'SHIFT_2',crusherId});await x.service.createColumn(operator,report.id,{displayOrder:0,headerPrimary:'BUFFER',headerSecondary:'TRASS',inputMode:'BUFFER'},'req');await expect(x.service.submit(qc,report.id)).rejects.toMatchObject({code:'CLAY_COLUMN_REQUIRED'});await x.service.updateColumn(qc,report.id,x.columns[0]!.id,{status:'CONFIRMED'});const submitted=await x.service.submit(qc,report.id);expect(submitted.status).toBe('SUBMITTED');});
});
