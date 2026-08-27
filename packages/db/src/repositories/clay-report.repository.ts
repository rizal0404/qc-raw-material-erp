import { asc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { ClayColumnRecord, ClayOperationLogRecord, ClayReportRecord, ClayReportRepository } from '@qc/domain';
import type * as Schema from '../schema/index';
import { auditLogs, clayReportColumns, clayReportOperationLogs, clayShiftReports, retaseEvents } from '../schema/index';

const s=(v:unknown)=>String(v);
const ns=(v:unknown)=>v==null?null:String(v);
const n=(v:unknown)=>v==null?null:Number(v);
const d=(v:unknown)=>v==null?null:(v instanceof Date?v:new Date(String(v)));
function reportRow(r:Record<string,unknown>):ClayReportRecord{return{
  id:s(r.id),operationDate:s(r.operation_date),shiftCode:s(r.shift_code),crusherId:s(r.crusher_id),crusherCode:s(r.crusher_code),crusherName:s(r.crusher_name),version:Number(r.version),status:s(r.status) as ClayReportRecord['status'],
  operatorUserId:ns(r.operator_user_id),operatorNameSnapshot:ns(r.operator_name_snapshot),productionTonnage:n(r.production_tonnage),runningMinutes:n(r.running_minutes),totalRunningMinutes:n(r.total_running_minutes),capacityTph:n(r.capacity_tph),stockPercent:n(r.stock_percent),pickupLocation:ns(r.pickup_location),weather:ns(r.weather),pileFilling:ns(r.pile_filling),sm:n(r.sm),sio2:n(r.sio2),h2o:n(r.h2o),attendancePresent:n(r.attendance_present),attendanceSick:n(r.attendance_sick),attendanceOvertime:n(r.attendance_overtime),attendancePermission:n(r.attendance_permission),attendanceLeave:n(r.attendance_leave),note:ns(r.note),createdBy:s(r.created_by),updatedBy:ns(r.updated_by),submittedBy:ns(r.submitted_by),submittedAt:d(r.submitted_at),approvedBy:ns(r.approved_by),approvedAt:d(r.approved_at),createdAt:d(r.created_at)!,updatedAt:d(r.updated_at)!,
};}
function columnRow(r:typeof clayReportColumns.$inferSelect):ClayColumnRecord{return{
  id:r.id,reportId:r.reportId,displayOrder:r.displayOrder,vendorId:r.vendorId,sourceId:r.sourceId,pileId:r.pileId,vendorNameSnapshot:r.vendorNameSnapshot,sourceNameSnapshot:r.sourceNameSnapshot,headerPrimary:r.headerPrimary,headerSecondary:r.headerSecondary,inputMode:r.inputMode as ClayColumnRecord['inputMode'],status:r.status as ClayColumnRecord['status'],tonPerRetaseSnapshot:n(r.tonPerRetaseSnapshot),createdBy:r.createdBy,updatedBy:r.updatedBy,createdAt:r.createdAt,updatedAt:r.updatedAt,
};}
function logRow(r:typeof clayReportOperationLogs.$inferSelect):ClayOperationLogRecord{return{id:r.id,reportId:r.reportId,displayOrder:r.displayOrder,startTime:r.startTime,endTime:r.endTime,category:r.category as ClayOperationLogRecord['category'],description:r.description,createdBy:r.createdBy,createdAt:r.createdAt};}

export function createClayReportRepository(db:PostgresJsDatabase<typeof Schema>):ClayReportRepository{
  function reportPatch(patch:Parameters<ClayReportRepository['updateReport']>[1]){
    const value:{[key:string]:unknown}={...patch,updatedAt:new Date()};
    for(const key of ['productionTonnage','capacityTph','stockPercent','sm','sio2','h2o'])if(typeof value[key]==='number')value[key]=String(value[key]);
    return value;
  }
  function columnPatch(patch:Parameters<ClayReportRepository['updateColumn']>[1]){const{tonPerRetaseSnapshot,...rest}=patch;return{...rest,...(tonPerRetaseSnapshot!==undefined?{tonPerRetaseSnapshot:tonPerRetaseSnapshot===null?null:String(tonPerRetaseSnapshot)}:{}),updatedAt:new Date()};}
  async function findReport(id:string):Promise<ClayReportRecord|null>{
    const rows=await db.execute(sql`SELECT r.*,c.code crusher_code,c.name crusher_name FROM clay_shift_reports r JOIN crushers c ON c.id=r.crusher_id WHERE r.id=${id}::uuid LIMIT 1`);
    const row=(rows as unknown as Record<string,unknown>[])[0];return row?reportRow(row):null;
  }
  return{
    async findCurrent(context){const rows=await db.execute(sql`SELECT r.*,c.code crusher_code,c.name crusher_name FROM clay_shift_reports r JOIN crushers c ON c.id=r.crusher_id WHERE r.operation_date=${context.operationDate}::date AND r.shift_code=${context.shiftCode} AND r.crusher_id=${context.crusherId}::uuid AND r.status<>'SUPERSEDED' LIMIT 1`);const row=(rows as unknown as Record<string,unknown>[])[0];return row?reportRow(row):null;},
    findReport,
    async createReport(input){const [row]=await db.insert(clayShiftReports).values({...input,materialKind:'CL'}).returning({id:clayShiftReports.id});if(!row)throw new Error('Gagal membuat laporan Clay.');const created=await findReport(row.id);if(!created)throw new Error('Gagal memuat laporan Clay.');return created;},
    async updateReport(id,patch){const [row]=await db.update(clayShiftReports).set(reportPatch(patch)).where(eq(clayShiftReports.id,id)).returning({id:clayShiftReports.id});return row?findReport(row.id):null;},
    async listColumns(reportId){const rows=await db.select().from(clayReportColumns).where(eq(clayReportColumns.reportId,reportId)).orderBy(asc(clayReportColumns.displayOrder));return rows.map(columnRow);},
    async findColumn(id){const [row]=await db.select().from(clayReportColumns).where(eq(clayReportColumns.id,id)).limit(1);return row?columnRow(row):null;},
    async createColumn(input){const [row]=await db.insert(clayReportColumns).values({...input,tonPerRetaseSnapshot:input.tonPerRetaseSnapshot==null?null:String(input.tonPerRetaseSnapshot),materialKind:'CL'}).returning();if(!row)throw new Error('Gagal membuat kolom Clay.');return columnRow(row);},
    async updateColumn(id,patch){const [row]=await db.update(clayReportColumns).set(columnPatch(patch)).where(eq(clayReportColumns.id,id)).returning();return row?columnRow(row):null;},
    async listOperationLogs(reportId){const rows=await db.select().from(clayReportOperationLogs).where(eq(clayReportOperationLogs.reportId,reportId)).orderBy(asc(clayReportOperationLogs.displayOrder));return rows.map(logRow);},
    async createOperationLog(input){const [row]=await db.insert(clayReportOperationLogs).values(input).returning();if(!row)throw new Error('Gagal membuat log operasi Clay.');return logRow(row);},
    async listHourly(reportId){const rows=await db.execute(sql`
      SELECT re.clay_report_column_id column_id,to_char(re.event_ts AT TIME ZONE 'Asia/Makassar','HH24:00') hour_label,
             coalesce(sum(re.delta),0)::int retase,coalesce(sum(re.delta*coalesce(crc.ton_per_retase_snapshot,0)),0)::float8 tonnage
      FROM retase_events re JOIN clay_report_columns crc ON crc.id=re.clay_report_column_id
      WHERE re.clay_report_id=${reportId}::uuid GROUP BY re.clay_report_column_id,hour_label,crc.display_order ORDER BY hour_label,crc.display_order`);
      return (rows as unknown as Record<string,unknown>[]).map(r=>({columnId:s(r.column_id),hour:s(r.hour_label),retase:Number(r.retase),tonnage:Number(r.tonnage)}));},
    async appendHourly(input){await db.transaction(async tx=>{
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.batchId}::text))`);
      const existing=await tx.select({id:retaseEvents.id}).from(retaseEvents).where(eq(retaseEvents.entryBatchId,input.batchId)).limit(1);if(existing.length)return;
      const values=Array.from({length:Math.abs(input.delta)},(_,index)=>({requestId:index===0?input.requestId:crypto.randomUUID(),operationDate:input.report.operationDate,eventTs:input.eventAt,shiftCode:input.report.shiftCode,crusherId:input.report.crusherId,vendorId:input.column.vendorId,clayReportId:input.report.id,clayReportColumnId:input.column.id,entrySource:'QC_BACKFILL' as const,entryBatchId:input.batchId,sourceId:input.column.sourceId,pileId:input.column.pileId,materialKind:'CL' as const,materialCategory:'CLAY',vendorNameSnapshot:input.column.vendorNameSnapshot,sourceNameSnapshot:input.column.sourceNameSnapshot,delta:(input.delta>0?1:-1) as 1|-1,eventType:'MANUAL_CORRECTION' as const,status:'VALID' as const,createdBy:input.createdBy,reason:input.reason}));
      await tx.insert(retaseEvents).values(values);
    });},
    async appendAudit(input){await db.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot??null,action:input.action,entityType:input.entityType,entityId:input.entityId,beforeJson:input.beforeJson as Record<string,unknown>|undefined,afterJson:input.afterJson as Record<string,unknown>|undefined,reason:input.reason??null,requestId:input.requestId});},
  };
}
