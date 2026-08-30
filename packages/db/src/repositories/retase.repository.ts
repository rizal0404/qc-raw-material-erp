import { and, desc, eq, ne, sql, type SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { RetaseEventRepository, CounterAssignmentRecord, AssignmentAaResolutionRecord, RetaseEventRecord, RetaseEventWriteRecord, RetaseSummaryRecord } from '@qc/domain';
import type { ShiftCode } from '@qc/contracts';
import type * as Schema from '../schema/index';
import { auditLogs, loadingAssignmentAas, loadingAssignments, retaseEvents } from '../schema/index';

function str(v:unknown):string{return v==null?'':String(v);}
function nullable(v:unknown):string|null{return v==null?null:String(v);}
function date(v:unknown):Date{return v instanceof Date?v:new Date(String(v));}
function n(v:unknown):number{return Number(v??0);}

function mapEvent(r:Record<string,unknown>):RetaseEventRecord{
  return {
    id:str(r.id),requestId:str(r.request_id),operationDate:str(r.operation_date),eventTs:date(r.event_ts),shiftCode:str(r.shift_code) as RetaseEventRecord['shiftCode'],
    crusherId:str(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:str(r.crusher_name),vendorId:nullable(r.vendor_id),vendorName:nullable(r.vendor_name),
    reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:n(r.report_version),assignmentId:nullable(r.assignment_id),assignmentAaId:nullable(r.assignment_aa_id),assignmentOrigin:(r.assignment_origin==null?null:str(r.assignment_origin)) as RetaseEventRecord['assignmentOrigin'],clayReportId:nullable(r.clay_report_id),clayReportColumnId:nullable(r.clay_report_column_id),entrySource:(r.entry_source?str(r.entry_source):'LIVE_COUNTER') as RetaseEventRecord['entrySource'],entryBatchId:nullable(r.entry_batch_id),
    amId:nullable(r.am_id),aaId:nullable(r.aa_id),sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),pileId:nullable(r.pile_id),pileCode:nullable(r.pile_code),pileName:nullable(r.pile_name),blockSnapshot:nullable(r.block_snapshot),
    materialKind:(r.material_kind==null?null:String(r.material_kind)) as RetaseEventRecord['materialKind'],materialCategory:nullable(r.material_category),
    vendorNameSnapshot:nullable(r.vendor_name_snapshot),sourceNameSnapshot:nullable(r.source_name_snapshot),amUnitNoSnapshot:nullable(r.am_unit_no_snapshot),aaUnitNoSnapshot:nullable(r.aa_unit_no_snapshot),
    delta:n(r.delta) as 1|-1,eventType:str(r.event_type) as RetaseEventRecord['eventType'],status:str(r.status) as RetaseEventRecord['status'],createdBy:str(r.created_by),createdByName:str(r.created_by_name),
    reversesEventId:nullable(r.reverses_event_id),reason:nullable(r.reason),clientTs:r.client_ts?date(r.client_ts):null,
  };
}

const EVENT_SELECT=sql`
  SELECT re.*,
         c.code AS crusher_code,c.name AS crusher_name,
         coalesce(v.name,re.vendor_name_snapshot) AS vendor_name,
         s.code AS source_code,
         p.code AS pile_code,p.name AS pile_name,
         u.display_name AS created_by_name
  FROM retase_events re
  JOIN crushers c ON c.id=re.crusher_id
  JOIN users u ON u.id=re.created_by
  LEFT JOIN vendors v ON v.id=re.vendor_id
  LEFT JOIN sources s ON s.id=re.source_id
  LEFT JOIN piles p ON p.id=re.pile_id
`;

export function createRetaseRepository(db:PostgresJsDatabase<typeof Schema>):RetaseEventRepository{
  async function eventById(id:string):Promise<RetaseEventRecord|null>{
    const rows=await db.execute(sql`${EVENT_SELECT} WHERE re.id=${id}::uuid LIMIT 1`);
    const row=(rows as unknown as Array<Record<string,unknown>>)[0];
    return row?mapEvent(row):null;
  }

  async function insertEvent(executor:any,input:RetaseEventWriteRecord):Promise<string>{
    const [created]=await executor.insert(retaseEvents).values({
      requestId:input.requestId,operationDate:input.operationDate,shiftCode:input.shiftCode,crusherId:input.crusherId,vendorId:input.vendorId,
      reportId:input.reportId,reportVersion:input.reportVersion,assignmentId:input.assignmentId,assignmentAaId:input.assignmentAaId,assignmentOrigin:input.assignmentOrigin,amId:input.amId,aaId:input.aaId,
      clayReportId:input.clayReportId,clayReportColumnId:input.clayReportColumnId,entrySource:input.entrySource,entryBatchId:input.entryBatchId,
      sourceId:input.sourceId,pileId:input.pileId,blockSnapshot:input.blockSnapshot,materialKind:input.materialKind,materialCategory:input.materialCategory,vendorNameSnapshot:input.vendorNameSnapshot,sourceNameSnapshot:input.sourceNameSnapshot,
      amUnitNoSnapshot:input.amUnitNoSnapshot,aaUnitNoSnapshot:input.aaUnitNoSnapshot,delta:input.delta,eventType:input.eventType,status:input.status,createdBy:input.createdBy,
      reversesEventId:input.reversesEventId,reason:input.reason,clientTs:input.clientTs,
    }).returning({id:retaseEvents.id});
    if(!created)throw new Error('Gagal menyimpan retase event.');
    return created.id;
  }

  async function operationalAssignments(filter:{operationDate:string;shiftCode:ShiftCode;vendorId?:string|undefined;crusherId?:string|undefined;status?:'ACTIVE'|'CLOSED'|'CANCELLED'|undefined}):Promise<CounterAssignmentRecord[]>{
    const rows=await db.execute(sql`
      SELECT la.id,la.assignment_origin,la.operation_date,la.shift_code,la.report_id,NULL::int AS report_version,la.vendor_id,v.code AS vendor_code,v.name AS vendor_name,
             la.am_id,am.unit_no AS am_unit_no,la.source_id,s.code AS source_code,s.name AS source_name,la.block_snapshot,la.material_kind,la.material_category,
             la.crusher_id,c.code AS crusher_code,c.name AS crusher_name,c.plant_id,pl.code AS plant_code,pl.name AS plant_name,
             la.pile_id,p.code AS pile_code,p.name AS pile_name,la.valid_from,la.valid_to,la.status,la.note,la.created_by,u.display_name AS created_by_name,la.updated_at
      FROM loading_assignments la JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id
      LEFT JOIN sources s ON s.id=la.source_id JOIN crushers c ON c.id=la.crusher_id LEFT JOIN plants pl ON pl.id=c.plant_id
      LEFT JOIN piles p ON p.id=la.pile_id LEFT JOIN users u ON u.id=la.created_by
      WHERE la.assignment_origin='OPERATIONAL' AND la.operation_date=${filter.operationDate}::date AND la.shift_code=${filter.shiftCode}
        ${filter.vendorId?sql`AND la.vendor_id=${filter.vendorId}::uuid`:sql``}${filter.crusherId?sql`AND la.crusher_id=${filter.crusherId}::uuid`:sql``}${filter.status?sql`AND la.status=${filter.status}::assignment_status`:sql``}
      ORDER BY CASE la.status WHEN 'ACTIVE' THEN 0 WHEN 'CLOSED' THEN 1 ELSE 2 END,v.name,am.unit_no,la.updated_at DESC
    `);
    const base=rows as unknown as Array<Record<string,unknown>>;if(!base.length)return [];
    const ids=base.map(r=>str(r.id));const aaRows=await db.execute(sql`
      SELECT laa.assignment_id,laa.id AS assignment_aa_id,e.id AS aa_id,e.unit_no,e.brand,e.model,
             coalesce(sum(re.delta),0)::int AS confirmed_count,max(re.event_ts) AS last_event_at
      FROM loading_assignment_aas laa JOIN equipment e ON e.id=laa.aa_id
      LEFT JOIN retase_events re ON re.assignment_aa_id=laa.id
      WHERE laa.active=true AND laa.assignment_id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})
      GROUP BY laa.assignment_id,laa.id,e.id,e.unit_no,e.brand,e.model ORDER BY e.unit_no
    `);
    const aaMap=new Map<string,CounterAssignmentRecord['aa']>();for(const r of aaRows as unknown as Array<Record<string,unknown>>){const key=str(r.assignment_id),list=aaMap.get(key)??[];list.push({assignmentAaId:str(r.assignment_aa_id),aaId:str(r.aa_id),unitNo:str(r.unit_no),brand:nullable(r.brand),model:nullable(r.model),confirmedCount:n(r.confirmed_count),lastEventAt:r.last_event_at?date(r.last_event_at):null});aaMap.set(key,list);}
    return base.map(r=>({id:str(r.id),assignmentOrigin:'OPERATIONAL',operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as ShiftCode,reportId:null,reportVersion:null,vendorId:str(r.vendor_id),vendorCode:str(r.vendor_code),vendorName:str(r.vendor_name),amId:str(r.am_id),amUnitNo:str(r.am_unit_no),sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),materialKind:str(r.material_kind) as CounterAssignmentRecord['materialKind'],materialCategory:str(r.material_category),crusherId:str(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:str(r.crusher_name),plantId:nullable(r.plant_id),plantCode:nullable(r.plant_code),plantName:nullable(r.plant_name),pileId:nullable(r.pile_id),pileCode:nullable(r.pile_code),pileName:nullable(r.pile_name),validFrom:r.valid_from?str(r.valid_from).slice(0,5):null,validTo:r.valid_to?str(r.valid_to).slice(0,5):null,status:str(r.status) as CounterAssignmentRecord['status'],note:nullable(r.note),createdBy:nullable(r.created_by),createdByName:nullable(r.created_by_name),updatedAt:date(r.updated_at),aa:aaMap.get(str(r.id))??[]}));
  }

  async function operationalById(id:string):Promise<CounterAssignmentRecord|null>{
    const rows=await db.execute(sql`SELECT operation_date,shift_code,vendor_id FROM loading_assignments WHERE id=${id}::uuid AND assignment_origin='OPERATIONAL' LIMIT 1`);const h=(rows as unknown as Array<Record<string,unknown>>)[0];if(!h)return null;
    return (await operationalAssignments({operationDate:str(h.operation_date),shiftCode:str(h.shift_code) as ShiftCode,vendorId:str(h.vendor_id)})).find(x=>x.id===id)??null;
  }

  return {
    async getClayCounterColumn(columnId){const rows=await db.execute(sql`
      SELECT col.id,col.report_id,r.operation_date,r.shift_code,r.crusher_id,r.status report_status,col.status column_status,
             col.vendor_id,coalesce(v.name,col.vendor_name_snapshot) vendor_name,col.source_id,coalesce(s.name,col.source_name_snapshot) source_name,
             col.pile_id,col.header_primary,col.header_secondary
      FROM clay_report_columns col JOIN clay_shift_reports r ON r.id=col.report_id LEFT JOIN vendors v ON v.id=col.vendor_id LEFT JOIN sources s ON s.id=col.source_id
      WHERE col.id=${columnId}::uuid LIMIT 1`);const x=(rows as unknown as Array<Record<string,unknown>>)[0];return x?{id:str(x.id),reportId:str(x.report_id),operationDate:str(x.operation_date),shiftCode:str(x.shift_code) as ShiftCode,crusherId:str(x.crusher_id),reportStatus:str(x.report_status) as 'DRAFT'|'SUBMITTED'|'APPROVED'|'SUPERSEDED',columnStatus:str(x.column_status) as 'PROVISIONAL'|'CONFIRMED'|'INACTIVE',vendorId:nullable(x.vendor_id),vendorName:nullable(x.vendor_name),sourceId:nullable(x.source_id),sourceName:nullable(x.source_name),pileId:nullable(x.pile_id),headerPrimary:str(x.header_primary),headerSecondary:nullable(x.header_secondary)}:null;},
    async listCounterAssignments(input){
      const rows=await db.execute(sql`
        SELECT la.id,la.assignment_origin,la.operation_date,la.shift_code,la.report_id,vsr.version AS report_version,la.vendor_id,v.code AS vendor_code,v.name AS vendor_name,
               la.am_id,am.unit_no AS am_unit_no,la.source_id,s.code AS source_code,s.name AS source_name,
               la.block_snapshot,la.material_kind,la.material_category,c.id AS crusher_id,c.code AS crusher_code,c.name AS crusher_name,
               c.plant_id,pl.code AS plant_code,pl.name AS plant_name,la.pile_id,p.code AS pile_code,p.name AS pile_name,
               la.valid_from,la.valid_to,la.status,la.note,la.created_by,u.display_name AS created_by_name,la.updated_at
        FROM loading_assignments la
        LEFT JOIN vendor_shift_reports vsr ON vsr.id=la.report_id
        JOIN vendors v ON v.id=la.vendor_id
        JOIN equipment am ON am.id=la.am_id
        LEFT JOIN sources s ON s.id=la.source_id
        JOIN crushers c ON c.id=${input.crusherId}::uuid AND c.material_kind=la.material_kind AND c.active=true
        LEFT JOIN plants pl ON pl.id=c.plant_id LEFT JOIN piles p ON p.id=la.pile_id LEFT JOIN users u ON u.id=la.created_by
        WHERE la.operation_date=${input.operationDate}::date AND la.shift_code=${input.shiftCode}
          AND (la.crusher_id=${input.crusherId}::uuid OR la.crusher_id IS NULL) AND la.status='ACTIVE'
          AND (la.assignment_origin='OPERATIONAL' OR vsr.status='SUBMITTED')
        ORDER BY CASE WHEN la.assignment_origin='OPERATIONAL' THEN 0 ELSE 1 END,v.name,am.unit_no,la.created_at
      `);
      const base=rows as unknown as Array<Record<string,unknown>>;
      if(!base.length)return [];
      const ids=base.map(r=>str(r.id));
      const aaRows=await db.execute(sql`
        SELECT laa.assignment_id,laa.id AS assignment_aa_id,e.id AS aa_id,e.unit_no,e.brand,e.model,
               coalesce(sum(re.delta),0)::int AS confirmed_count,max(re.event_ts) AS last_event_at
        FROM loading_assignment_aas laa
        JOIN equipment e ON e.id=laa.aa_id
        LEFT JOIN retase_events re ON re.assignment_aa_id=laa.id
          AND re.operation_date=${input.operationDate}::date AND re.shift_code=${input.shiftCode} AND re.crusher_id=${input.crusherId}::uuid
        WHERE laa.active=true AND laa.assignment_id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})
        GROUP BY laa.assignment_id,laa.id,e.id,e.unit_no,e.brand,e.model
        ORDER BY e.unit_no
      `);
      const aaMap=new Map<string,CounterAssignmentRecord['aa']>();
      for(const r of aaRows as unknown as Array<Record<string,unknown>>){
        const key=str(r.assignment_id),list=aaMap.get(key)??[];
        list.push({assignmentAaId:str(r.assignment_aa_id),aaId:str(r.aa_id),unitNo:str(r.unit_no),brand:nullable(r.brand),model:nullable(r.model),confirmedCount:n(r.confirmed_count),lastEventAt:r.last_event_at?date(r.last_event_at):null});
        aaMap.set(key,list);
      }
      return base.map((r)=>({
        id:str(r.id),assignmentOrigin:str(r.assignment_origin) as CounterAssignmentRecord['assignmentOrigin'],operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as ShiftCode,reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:n(r.report_version),vendorId:str(r.vendor_id),vendorCode:str(r.vendor_code),vendorName:str(r.vendor_name),
        amId:str(r.am_id),amUnitNo:str(r.am_unit_no),sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),
        materialKind:str(r.material_kind) as CounterAssignmentRecord['materialKind'],materialCategory:str(r.material_category),crusherId:str(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:str(r.crusher_name),
        plantId:nullable(r.plant_id),plantCode:nullable(r.plant_code),plantName:nullable(r.plant_name),pileId:nullable(r.pile_id),pileCode:nullable(r.pile_code),pileName:nullable(r.pile_name),
        validFrom:r.valid_from?str(r.valid_from).slice(0,5):null,validTo:r.valid_to?str(r.valid_to).slice(0,5):null,status:str(r.status) as CounterAssignmentRecord['status'],note:nullable(r.note),createdBy:nullable(r.created_by),createdByName:nullable(r.created_by_name),updatedAt:date(r.updated_at),aa:aaMap.get(str(r.id))??[],
      }));
    },

    async listAssignmentCandidatesForAa(input){
      const rows=await db.execute(sql`
        SELECT laa.id AS assignment_aa_id,la.id AS assignment_id,la.assignment_origin,la.report_id,vsr.version AS report_version,la.operation_date,la.shift_code,
               la.vendor_id,v.code AS vendor_code,v.name AS vendor_name,la.am_id,am.unit_no AS am_unit_no,
               laa.aa_id,aa.unit_no AS aa_unit_no,la.source_id,s.code AS source_code,s.name AS source_name,la.block_snapshot,la.material_kind,la.material_category,
               c.id AS crusher_id,c.code AS crusher_code,c.name AS crusher_name,la.pile_id,p.code AS pile_code,p.name AS pile_name,coalesce(laa.valid_from,la.valid_from) AS valid_from,coalesce(laa.valid_to,la.valid_to) AS valid_to
        FROM loading_assignment_aas laa
        JOIN loading_assignments la ON la.id=laa.assignment_id AND la.status='ACTIVE'
        LEFT JOIN vendor_shift_reports vsr ON vsr.id=la.report_id
        JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id JOIN equipment aa ON aa.id=laa.aa_id
        LEFT JOIN sources s ON s.id=la.source_id JOIN crushers c ON c.id=${input.crusherId}::uuid AND c.material_kind=la.material_kind AND c.active=true LEFT JOIN piles p ON p.id=la.pile_id
        WHERE la.operation_date=${input.operationDate}::date AND la.shift_code=${input.shiftCode} AND (la.crusher_id=${input.crusherId}::uuid OR la.crusher_id IS NULL)
          AND laa.aa_id=${input.aaId}::uuid AND laa.active=true AND (la.assignment_origin='OPERATIONAL' OR vsr.status='SUBMITTED')
        ORDER BY CASE WHEN la.assignment_origin='OPERATIONAL' THEN 0 ELSE 1 END,vsr.version DESC NULLS LAST,la.created_at
      `);
      return (rows as unknown as Array<Record<string,unknown>>).map((r)=>({
        assignmentAaId:str(r.assignment_aa_id),assignmentId:str(r.assignment_id),assignmentOrigin:str(r.assignment_origin) as AssignmentAaResolutionRecord['assignmentOrigin'],reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:n(r.report_version),operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as AssignmentAaResolutionRecord['shiftCode'],
        vendorId:str(r.vendor_id),vendorCode:str(r.vendor_code),vendorName:str(r.vendor_name),amId:str(r.am_id),amUnitNo:str(r.am_unit_no),aaId:str(r.aa_id),aaUnitNo:str(r.aa_unit_no),
        sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),materialKind:str(r.material_kind) as AssignmentAaResolutionRecord['materialKind'],
        materialCategory:str(r.material_category),crusherId:str(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:str(r.crusher_name),pileId:nullable(r.pile_id),pileCode:nullable(r.pile_code),pileName:nullable(r.pile_name),validFrom:r.valid_from?str(r.valid_from).slice(0,5):null,validTo:r.valid_to?str(r.valid_to).slice(0,5):null,
      }));
    },

    async getAssignmentAaById(assignmentAaId,crusherId){
      const rows=await db.execute(sql`
        SELECT laa.id AS assignment_aa_id,la.id AS assignment_id,la.assignment_origin,la.report_id,vsr.version AS report_version,la.operation_date,la.shift_code,
               la.vendor_id,v.code AS vendor_code,v.name AS vendor_name,la.am_id,am.unit_no AS am_unit_no,laa.aa_id,aa.unit_no AS aa_unit_no,
               la.source_id,s.code AS source_code,s.name AS source_name,la.block_snapshot,la.material_kind,la.material_category,c.id AS crusher_id,c.code AS crusher_code,c.name AS crusher_name,la.pile_id,p.code AS pile_code,p.name AS pile_name,
               coalesce(laa.valid_from,la.valid_from) AS valid_from,coalesce(laa.valid_to,la.valid_to) AS valid_to
        FROM loading_assignment_aas laa JOIN loading_assignments la ON la.id=laa.assignment_id AND la.status='ACTIVE'
        LEFT JOIN vendor_shift_reports vsr ON vsr.id=la.report_id
        JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id JOIN equipment aa ON aa.id=laa.aa_id
        LEFT JOIN sources s ON s.id=la.source_id JOIN crushers c ON c.id=${crusherId}::uuid AND c.material_kind=la.material_kind AND c.active=true LEFT JOIN piles p ON p.id=la.pile_id
        WHERE (la.crusher_id IS NULL OR la.crusher_id=${crusherId}::uuid) AND laa.id=${assignmentAaId}::uuid AND laa.active=true AND (la.assignment_origin='OPERATIONAL' OR vsr.status='SUBMITTED') LIMIT 1
      `);
      const r=(rows as unknown as Array<Record<string,unknown>>)[0];
      return r?{
        assignmentAaId:str(r.assignment_aa_id),assignmentId:str(r.assignment_id),assignmentOrigin:str(r.assignment_origin) as AssignmentAaResolutionRecord['assignmentOrigin'],reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:n(r.report_version),operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as AssignmentAaResolutionRecord['shiftCode'],
        vendorId:str(r.vendor_id),vendorCode:str(r.vendor_code),vendorName:str(r.vendor_name),amId:str(r.am_id),amUnitNo:str(r.am_unit_no),aaId:str(r.aa_id),aaUnitNo:str(r.aa_unit_no),
        sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),materialKind:str(r.material_kind) as AssignmentAaResolutionRecord['materialKind'],
        materialCategory:str(r.material_category),crusherId:str(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:str(r.crusher_name),pileId:nullable(r.pile_id),pileCode:nullable(r.pile_code),pileName:nullable(r.pile_name),validFrom:r.valid_from?str(r.valid_from).slice(0,5):null,validTo:r.valid_to?str(r.valid_to).slice(0,5):null,
      }:null;
    },

    async findByRequestId(requestId){
      const rows=await db.execute(sql`${EVENT_SELECT} WHERE re.request_id=${requestId}::uuid LIMIT 1`);
      const r=(rows as unknown as Array<Record<string,unknown>>)[0];return r?mapEvent(r):null;
    },
    getEventById:eventById,
    async appendEvent(input){
      const id=await insertEvent(db,input);const created=await eventById(id);if(!created)throw new Error('Retase event gagal direload.');return created;
    },
    async getEventConsumption(eventId){
      const rows=await db.execute(sql`SELECT qae.allocation_id,qa.mix_id,m.mix_code FROM qc_retase_allocation_events qae JOIN qc_retase_allocations qa ON qa.id=qae.allocation_id LEFT JOIN mixes m ON m.id=qa.mix_id WHERE qae.event_id=${eventId}::uuid AND qae.active=true LIMIT 1`);
      const r=(rows as unknown as Array<Record<string,unknown>>)[0];return r?{allocationId:str(r.allocation_id),mixId:str(r.mix_id),mixCode:nullable(r.mix_code)}:null;
    },
    async reverseEvent(input){
      const reversalId=await db.transaction(async(tx)=>{
        const [old]=await tx.select({id:retaseEvents.id,status:retaseEvents.status}).from(retaseEvents).where(eq(retaseEvents.id,input.originalEventId)).limit(1);
        if(!old)throw new Error('Original retase event tidak ditemukan.');
        if(old.status==='REVERSED')throw new Error('Retase event sudah direversal.');
        await tx.update(retaseEvents).set({status:'REVERSED'}).where(eq(retaseEvents.id,input.originalEventId));
        const reversalId=await insertEvent(tx,input.reversal);
        await tx.execute(sql`UPDATE qc_retase_allocations qa SET review_required=true,review_reason='CONSUMED_EVENT_REVERSED',updated_at=now() WHERE EXISTS (SELECT 1 FROM qc_retase_allocation_events qae WHERE qae.allocation_id=qa.id AND qae.event_id=${input.originalEventId}::uuid AND qae.active=true)`);
        return reversalId;
      });
      const created=await eventById(reversalId);if(!created)throw new Error('Reversal event gagal direload.');return created;
    },
    async findLatestReversibleByActor(input){
      const rows=await db.execute(sql`${EVENT_SELECT}
        WHERE re.operation_date=${input.operationDate}::date AND re.shift_code=${input.shiftCode} AND re.crusher_id=${input.crusherId}::uuid
          AND re.created_by=${input.actorUserId}::uuid AND re.event_type='DUMP' AND re.delta=1 AND re.status<>'REVERSED'
        ORDER BY re.event_ts DESC LIMIT 1`);
      const r=(rows as unknown as Array<Record<string,unknown>>)[0];return r?mapEvent(r):null;
    },
    async listEvents(filter){
      const conditions:SQL[]=[sql`re.operation_date=${filter.operationDate}::date`,sql`re.shift_code=${filter.shiftCode}`,sql`re.crusher_id=${filter.crusherId}::uuid`];
      if(filter.vendorId)conditions.push(sql`re.vendor_id=${filter.vendorId}::uuid`);if(filter.aaId)conditions.push(sql`re.aa_id=${filter.aaId}::uuid`);
      const where=sql`${sql.join(conditions,sql` AND `)}`;
      const [rows,totalRows]=await Promise.all([
        db.execute(sql`${EVENT_SELECT} WHERE ${where} ORDER BY re.event_ts DESC LIMIT ${filter.limit} OFFSET ${filter.offset}`),
        db.execute(sql`SELECT count(*)::int AS total FROM retase_events re WHERE ${where}`),
      ]);
      return {items:(rows as unknown as Array<Record<string,unknown>>).map(mapEvent),total:n((totalRows as unknown as Array<Record<string,unknown>>)[0]?.total)};
    },
    async getSummary(input){
      const base=sql`operation_date=${input.operationDate}::date AND shift_code=${input.shiftCode} AND crusher_id=${input.crusherId}::uuid`;
      const [totals,vendorRows,amRows,aaRows,hourRows]=await Promise.all([
        db.execute(sql`SELECT coalesce(sum(delta),0)::int AS total_net,count(*) FILTER(WHERE event_type='DUMP')::int AS dump_events,count(*) FILTER(WHERE event_type='REVERSAL')::int AS reversal_events,count(*) FILTER(WHERE status='EXCEPTION_UNASSIGNED')::int AS unassigned_events,count(*) FILTER(WHERE status='AMBIGUOUS')::int AS ambiguous_events FROM retase_events WHERE ${base}`),
        db.execute(sql`SELECT vendor_id AS id,coalesce(max(vendor_name_snapshot),'UNASSIGNED') AS label,coalesce(sum(delta),0)::int AS retase FROM retase_events WHERE ${base} GROUP BY vendor_id ORDER BY label`),
        db.execute(sql`SELECT am_id AS id,coalesce(max(am_unit_no_snapshot),'UNASSIGNED') AS label,coalesce(sum(delta),0)::int AS retase FROM retase_events WHERE ${base} GROUP BY am_id ORDER BY label`),
        db.execute(sql`SELECT aa_id AS id,coalesce(max(aa_unit_no_snapshot),'UNKNOWN') AS label,coalesce(sum(delta),0)::int AS retase FROM retase_events WHERE ${base} GROUP BY aa_id,aa_unit_no_snapshot ORDER BY label`),
        db.execute(sql`SELECT to_char(event_ts AT TIME ZONE 'Asia/Makassar','HH24')||':00' AS hour,coalesce(sum(delta),0)::int AS retase FROM retase_events WHERE ${base} AND NOT(entry_source='IMPORT' AND material_kind='LS') GROUP BY 1 ORDER BY 1`),
      ]);
      const t=(totals as unknown as Array<Record<string,unknown>>)[0]??{};
      const bucket=(rows:any)=> (rows as Array<Record<string,unknown>>).map(r=>({id:nullable(r.id),label:str(r.label),retase:n(r.retase)}));
      return {totalNet:n(t.total_net),dumpEvents:n(t.dump_events),reversalEvents:n(t.reversal_events),unassignedEvents:n(t.unassigned_events),ambiguousEvents:n(t.ambiguous_events),byVendor:bucket(vendorRows),byAm:bucket(amRows),byAa:bucket(aaRows),hourly:(hourRows as unknown as Array<Record<string,unknown>>).map(r=>({hour:str(r.hour),retase:n(r.retase)}))} satisfies RetaseSummaryRecord;
    },
    async countEffectiveSubmittedReports(input){
      const rows=await db.execute(sql`SELECT count(DISTINCT la.report_id)::int AS total FROM loading_assignments la JOIN vendor_shift_reports r ON r.id=la.report_id AND r.status='SUBMITTED' JOIN crushers c ON c.id=${input.crusherId}::uuid AND c.material_kind=la.material_kind AND c.active=true WHERE la.operation_date=${input.operationDate}::date AND la.shift_code=${input.shiftCode} AND (la.crusher_id=${input.crusherId}::uuid OR la.crusher_id IS NULL) AND la.status='ACTIVE'`);
      return n((rows as unknown as Array<Record<string,unknown>>)[0]?.total);
    },
    listOperationalAssignments:operationalAssignments,
    getOperationalAssignment:operationalById,
    async createOperationalAssignment(input,actorUserId){
      const id=await db.transaction(async tx=>{const [created]=await tx.insert(loadingAssignments).values({reportId:null,assignmentOrigin:'OPERATIONAL',operationDate:input.operationDate,shiftCode:input.shiftCode,vendorId:input.vendorId,amId:input.amId,sourceId:input.sourceId,crusherId:input.crusherId,pileId:input.pileId,blockSnapshot:input.blockSnapshot,materialKind:input.materialKind,materialCategory:input.materialCategory,validFrom:input.validFrom,validTo:input.validTo,status:'ACTIVE',note:input.note,createdBy:actorUserId,updatedBy:actorUserId}).returning({id:loadingAssignments.id});if(!created)throw new Error('Gagal membuat operational assignment.');await tx.insert(loadingAssignmentAas).values(input.aaIds.map(aaId=>({assignmentId:created.id,aaId,materialKind:input.materialKind,validFrom:input.validFrom,validTo:input.validTo,active:true})));return created.id;});
      const created=await operationalById(id);if(!created)throw new Error('Operational assignment tersimpan tetapi gagal direload.');return created;
    },
    async updateOperationalAssignment(id,input,actorUserId){
      await db.transaction(async tx=>{const locked=await tx.execute(sql`SELECT id,status FROM loading_assignments WHERE id=${id}::uuid AND assignment_origin='OPERATIONAL' FOR UPDATE`);const row=(locked as unknown as Array<Record<string,unknown>>)[0];if(!row)throw new Error('Operational assignment tidak ditemukan.');if(str(row.status)!=='ACTIVE')throw new Error('Hanya operational assignment ACTIVE yang dapat diubah.');await tx.update(loadingAssignments).set({amId:input.amId,sourceId:input.sourceId,crusherId:input.crusherId,pileId:input.pileId,blockSnapshot:input.blockSnapshot,materialKind:input.materialKind,materialCategory:input.materialCategory,validFrom:input.validFrom,validTo:input.validTo,note:input.note,updatedBy:actorUserId,updatedAt:new Date()}).where(eq(loadingAssignments.id,id));await tx.delete(loadingAssignmentAas).where(eq(loadingAssignmentAas.assignmentId,id));await tx.insert(loadingAssignmentAas).values(input.aaIds.map(aaId=>({assignmentId:id,aaId,materialKind:input.materialKind,validFrom:input.validFrom,validTo:input.validTo,active:true})));});
      const updated=await operationalById(id);if(!updated)throw new Error('Operational assignment diubah tetapi gagal direload.');return updated;
    },
    async cancelOperationalAssignment(id,actorUserId){
      const [row]=await db.update(loadingAssignments).set({status:'CANCELLED',updatedBy:actorUserId,updatedAt:new Date()}).where(and(eq(loadingAssignments.id,id),eq(loadingAssignments.assignmentOrigin,'OPERATIONAL'),ne(loadingAssignments.status,'CANCELLED'))).returning({id:loadingAssignments.id});if(!row)throw new Error('Operational assignment tidak ditemukan atau sudah CANCELLED.');const updated=await operationalById(id);if(!updated)throw new Error('Operational assignment dibatalkan tetapi gagal direload.');return updated;
    },
    async appendAudit(input){await db.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot??null,action:input.action,entityType:input.entityType,entityId:input.entityId,beforeJson:input.beforeJson,afterJson:input.afterJson,reason:input.reason??null,requestId:input.requestId});},
  };
}
