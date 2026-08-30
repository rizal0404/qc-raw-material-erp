import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { assignmentActiveAtLocalMinute, calculateQuality, localPartsAt } from '@qc/domain';
import type { ReconciliationRepository, ReconciliationAssignmentRecord, ReconciliationCandidateRecord, RetaseAllocationRecord } from '@qc/domain';
import type { Chemistry, MaterialKind, ShiftCode } from '@qc/contracts';
import type * as Schema from '../schema/index';
import { auditLogs, qcRetaseAllocations } from '../schema/index';

const CHEM_KEYS=['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;
const str=(v:unknown)=>v==null?'':String(v);const nullable=(v:unknown)=>v==null?null:String(v);const num=(v:unknown)=>Number(v??0);const date=(v:unknown)=>v instanceof Date?v:new Date(String(v));
function chemistry(r:Record<string,unknown>):Chemistry{return Object.fromEntries(CHEM_KEYS.map(k=>[k,r[k]==null?null:Number(r[k])])) as Chemistry;}

function allocation(r:Record<string,unknown>):RetaseAllocationRecord{
  return {id:str(r.id),assignmentId:str(r.assignment_id),sampleId:nullable(r.sample_id),sampleCode:nullable(r.sample_code),mappingStatus:str(r.mapping_status) as RetaseAllocationRecord['mappingStatus'],observedRetase:num(r.observed_retase),approvedRetase:r.approved_retase==null?null:num(r.approved_retase),consumedRetase:num(r.consumed_retase),candidateCount:num(r.candidate_count),note:nullable(r.note),overrideReason:nullable(r.override_reason),reviewRequired:Boolean(r.review_required),reviewReason:nullable(r.review_reason),confirmedBy:nullable(r.confirmed_by),confirmedByName:nullable(r.confirmed_by_name),confirmedAt:r.confirmed_at?date(r.confirmed_at):null,consumedMixId:nullable(r.mix_id),consumedMixCode:nullable(r.mix_code),consumedAt:r.consumed_at?date(r.consumed_at):null,createdBy:nullable(r.created_by),createdAt:date(r.created_at),updatedAt:date(r.updated_at)};
}

const ALLOCATION_SELECT=sql`
  SELECT qa.*,rs.sample_id AS sample_code,u.display_name AS confirmed_by_name,m.mix_code
  FROM qc_retase_allocations qa
  LEFT JOIN raw_samples rs ON rs.id=qa.sample_id
  LEFT JOIN users u ON u.id=qa.confirmed_by
  LEFT JOIN mixes m ON m.id=qa.mix_id
`;

export function createReconciliationRepository(db:PostgresJsDatabase<typeof Schema>):ReconciliationRepository{
  async function allocationById(id:string){const rows=await db.execute(sql`${ALLOCATION_SELECT} WHERE qa.id=${id}::uuid LIMIT 1`);const r=(rows as unknown as Array<Record<string,unknown>>)[0];return r?allocation(r):null;}

  async function assignmentRows(filter:{operationDate:string;shiftCode?:ShiftCode | undefined;crusherId?:string | undefined;vendorId?:string | undefined;materialKind?:MaterialKind | undefined;search?:string | undefined}){
    const rows=await db.execute(sql`
      WITH event_stats AS (
        SELECT assignment_id,
               count(*) FILTER (WHERE event_type='DUMP' AND status='VALID')::int AS observed_retase,
               count(DISTINCT aa_id) FILTER (WHERE event_type='DUMP' AND status='VALID' AND aa_id IS NOT NULL AND EXISTS (SELECT 1 FROM loading_assignment_aas x WHERE x.assignment_id=retase_events.assignment_id AND x.aa_id=retase_events.aa_id AND x.active=true))::int AS aa_with_dump_count
        FROM retase_events
        WHERE operation_date=${filter.operationDate}::date
        GROUP BY assignment_id
      ), aa_stats AS (
        SELECT laa.assignment_id,
          count(*) FILTER (WHERE laa.active=true)::int AS assigned_aa_count,
          coalesce(array_agg(DISTINCT aa.unit_no ORDER BY aa.unit_no) FILTER (WHERE laa.active=true), ARRAY[]::text[]) AS assigned_aa_unit_nos
        FROM loading_assignment_aas laa JOIN equipment aa ON aa.id=laa.aa_id
        GROUP BY laa.assignment_id
      ), alloc_stats AS (
        SELECT assignment_id,
          coalesce(sum(CASE WHEN mapping_status IN ('RESERVED','CONFIRMED','REVIEW_REQUIRED') THEN approved_retase ELSE 0 END),0)::int AS confirmed_reserved,
          coalesce(sum(CASE WHEN mapping_status='CONSUMED' THEN consumed_retase ELSE 0 END),0)::int AS consumed_retase,
          bool_or(review_required) AS review_required
        FROM qc_retase_allocations GROUP BY assignment_id
      )
      SELECT la.id AS assignment_id,la.assignment_origin,la.report_id,r.version AS report_version,coalesce(r.status::text,'OPERATIONAL') AS report_status,la.operation_date,la.shift_code,
        la.crusher_id,c.code AS crusher_code,c.name AS crusher_name,la.vendor_id,v.code AS vendor_code,v.name AS vendor_name,
        la.am_id,am.unit_no AS am_unit_no,la.source_id,s.code AS source_code,s.name AS source_name,la.block_snapshot,la.material_kind,la.material_category,
        coalesce(ast.assigned_aa_count,0) AS assigned_aa_count,coalesce(ast.assigned_aa_unit_nos,ARRAY[]::text[]) AS assigned_aa_unit_nos,coalesce(es.aa_with_dump_count,0) AS aa_with_dump_count,
        coalesce(es.observed_retase,0) AS observed_retase,coalesce(als.confirmed_reserved,0) AS confirmed_reserved,coalesce(als.consumed_retase,0) AS consumed_retase,
        coalesce(als.review_required,false) AS review_required
      FROM loading_assignments la
      LEFT JOIN vendor_shift_reports r ON r.id=la.report_id
      LEFT JOIN crushers c ON c.id=la.crusher_id JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id
      LEFT JOIN sources s ON s.id=la.source_id LEFT JOIN event_stats es ON es.assignment_id=la.id LEFT JOIN aa_stats ast ON ast.assignment_id=la.id LEFT JOIN alloc_stats als ON als.assignment_id=la.id
      WHERE la.operation_date=${filter.operationDate}::date AND la.status='ACTIVE'
        AND (la.assignment_origin='OPERATIONAL' OR r.status='SUBMITTED' OR coalesce(es.observed_retase,0)>0 OR coalesce(als.confirmed_reserved,0)>0 OR coalesce(als.consumed_retase,0)>0 OR coalesce(als.review_required,false))
        ${filter.shiftCode?sql`AND la.shift_code=${filter.shiftCode}`:sql``}
        ${filter.crusherId?sql`AND (la.crusher_id=${filter.crusherId}::uuid OR (la.crusher_id IS NULL AND EXISTS (SELECT 1 FROM crushers destination WHERE destination.id=${filter.crusherId}::uuid AND destination.material_kind=la.material_kind)))`:sql``}
        ${filter.vendorId?sql`AND la.vendor_id=${filter.vendorId}::uuid`:sql``}
        ${filter.materialKind?sql`AND la.material_kind=${filter.materialKind}`:sql``}
        ${filter.search?sql`AND (v.name ILIKE ${'%'+filter.search+'%'} OR am.unit_no ILIKE ${'%'+filter.search+'%'} OR coalesce(s.name,'') ILIKE ${'%'+filter.search+'%'} OR coalesce(la.block_snapshot,'') ILIKE ${'%'+filter.search+'%'})`:sql``}
      ORDER BY la.shift_code,c.name,v.name,am.unit_no,la.created_at
    `);
    return rows as unknown as Array<Record<string,unknown>>;
  }

  async function allocationsForAssignments(ids:string[]){
    if(!ids.length)return new Map<string,RetaseAllocationRecord[]>();
    const rows=await db.execute(sql`${ALLOCATION_SELECT} WHERE qa.assignment_id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)}) ORDER BY qa.created_at`);
    const map=new Map<string,RetaseAllocationRecord[]>();for(const r of rows as unknown as Array<Record<string,unknown>>){const a=allocation(r),list=map.get(a.assignmentId)??[];list.push(a);map.set(a.assignmentId,list);}return map;
  }

  return {
    async listAssignments(filter){
      const rows=await assignmentRows(filter);const ids=rows.map(r=>str(r.assignment_id));const alloc=await allocationsForAssignments(ids);
      return rows.map(r=>{const observed=num(r.observed_retase),reserved=num(r.confirmed_reserved)+num(r.consumed_retase);return {assignmentId:str(r.assignment_id),assignmentOrigin:str(r.assignment_origin) as ReconciliationAssignmentRecord['assignmentOrigin'],reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:num(r.report_version),reportStatus:str(r.report_status),operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as ShiftCode,crusherId:nullable(r.crusher_id),crusherCode:str(r.crusher_code),crusherName:nullable(r.crusher_name)??'Lintas crusher',vendorId:str(r.vendor_id),vendorCode:str(r.vendor_code),vendorName:str(r.vendor_name),amId:str(r.am_id),amUnitNo:str(r.am_unit_no),sourceId:nullable(r.source_id),sourceCode:nullable(r.source_code),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),materialKind:str(r.material_kind) as MaterialKind,materialCategory:str(r.material_category),assignedAaCount:num(r.assigned_aa_count),assignedAaUnitNos:Array.isArray(r.assigned_aa_unit_nos)?r.assigned_aa_unit_nos.map(String):[],aaWithDumpCount:num(r.aa_with_dump_count),observedRetase:observed,reservedRetase:reserved,consumedRetase:num(r.consumed_retase),remainingRetase:observed-reserved,reviewRequired:Boolean(r.review_required),allocations:alloc.get(str(r.assignment_id))??[]} satisfies ReconciliationAssignmentRecord;});
    },
    async getAssignment(assignmentId){
      const head=await db.execute(sql`SELECT operation_date FROM loading_assignments WHERE id=${assignmentId}::uuid LIMIT 1`);const h=(head as unknown as Array<Record<string,unknown>>)[0];if(!h)return null;
      const rows=await assignmentRows({operationDate:str(h.operation_date)});const row=rows.find(r=>str(r.assignment_id)===assignmentId);if(!row)return null;
      const alloc=await allocationsForAssignments([assignmentId]);const observed=num(row.observed_retase),reserved=num(row.confirmed_reserved)+num(row.consumed_retase);
      return {assignmentId:str(row.assignment_id),assignmentOrigin:str(row.assignment_origin) as ReconciliationAssignmentRecord['assignmentOrigin'],reportId:nullable(row.report_id),reportVersion:row.report_version==null?null:num(row.report_version),reportStatus:str(row.report_status),operationDate:str(row.operation_date),shiftCode:str(row.shift_code) as ShiftCode,crusherId:nullable(row.crusher_id),crusherCode:str(row.crusher_code),crusherName:nullable(row.crusher_name)??'Lintas crusher',vendorId:str(row.vendor_id),vendorCode:str(row.vendor_code),vendorName:str(row.vendor_name),amId:str(row.am_id),amUnitNo:str(row.am_unit_no),sourceId:nullable(row.source_id),sourceCode:nullable(row.source_code),sourceName:nullable(row.source_name),blockSnapshot:nullable(row.block_snapshot),materialKind:str(row.material_kind) as MaterialKind,materialCategory:str(row.material_category),assignedAaCount:num(row.assigned_aa_count),assignedAaUnitNos:Array.isArray(row.assigned_aa_unit_nos)?row.assigned_aa_unit_nos.map(String):[],aaWithDumpCount:num(row.aa_with_dump_count),observedRetase:observed,reservedRetase:reserved,consumedRetase:num(row.consumed_retase),remainingRetase:observed-reserved,reviewRequired:Boolean(row.review_required),allocations:alloc.get(assignmentId)??[]};
    },
    async listCandidates(assignmentId){
      const rows=await db.execute(sql`
        WITH a AS (
          SELECT la.id,la.operation_date,la.material_kind,la.vendor_id,v.name AS vendor_name,v.code AS vendor_code,am.unit_no AS am_unit_no,am.aliases AS am_aliases
          FROM loading_assignments la JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id WHERE la.id=${assignmentId}::uuid
        ), aliases AS (
          SELECT lower(regexp_replace(trim(v.name),'\\s+',' ','g')) AS normalized FROM a JOIN vendors v ON v.id=a.vendor_id
          UNION SELECT lower(regexp_replace(trim(v.code),'\\s+',' ','g')) FROM a JOIN vendors v ON v.id=a.vendor_id
          UNION SELECT va.normalized_alias FROM a JOIN vendor_aliases va ON va.vendor_id=a.vendor_id
        ), am_aliases AS (
          SELECT lower(regexp_replace(trim(alias_value),'\\s+',' ','g')) AS normalized
          FROM a CROSS JOIN LATERAL unnest(a.am_aliases || ARRAY[a.am_unit_no]) AS alias_value
        )
        SELECT rs.*,
          CASE WHEN lower(regexp_replace(trim(coalesce(rs.loader_unit_no,'')),'\\s+',' ','g')) IN (SELECT normalized FROM am_aliases) THEN 'AM_ID'
               WHEN rs.vendor_id=a.vendor_id THEN 'VENDOR_ID' ELSE 'VENDOR_TEXT' END AS match_mode
        FROM raw_samples rs CROSS JOIN a
        WHERE rs.sample_date=a.operation_date AND rs.material_kind=a.material_kind
          AND (lower(regexp_replace(trim(coalesce(rs.loader_unit_no,'')),'\\s+',' ','g')) IN (SELECT normalized FROM am_aliases)
               OR rs.vendor_id=a.vendor_id
               OR (rs.vendor_id IS NULL AND lower(regexp_replace(trim(coalesce(rs.vendor_snapshot,'')),'\\s+',' ','g')) IN (SELECT normalized FROM aliases)))
        ORDER BY rs.sample_id
      `);
      return (rows as unknown as Array<Record<string,unknown>>).map(r=>{const c=chemistry(r);return {id:str(r.id),sampleId:str(r.sample_id),materialKind:str(r.material_kind) as MaterialKind,operationDate:str(r.sample_date),vendorId:nullable(r.vendor_id),vendorSnapshot:nullable(r.vendor_snapshot),sourceId:nullable(r.source_id),sourceSnapshot:nullable(r.source_snapshot),block:nullable(r.block),typeGrade:nullable(r.type_grade),chemistry:c,quality:calculateQuality(c),matchMode:str(r.match_mode) as 'AM_ID'|'VENDOR_ID'|'VENDOR_TEXT'} satisfies ReconciliationCandidateRecord;});
    },
    async listExceptions(filter){
      const rows=await db.execute(sql`
        SELECT re.id AS event_id,re.event_ts,re.operation_date,re.shift_code,re.crusher_id,c.name AS crusher_name,re.vendor_id,coalesce(v.name,re.vendor_name_snapshot) AS vendor_name,
          re.aa_id,re.aa_unit_no_snapshot AS aa_unit_no,re.status,re.reason
        FROM retase_events re JOIN crushers c ON c.id=re.crusher_id LEFT JOIN vendors v ON v.id=re.vendor_id
        WHERE re.operation_date=${filter.operationDate}::date AND re.event_type='DUMP' AND re.status IN ('EXCEPTION_UNASSIGNED','AMBIGUOUS')
          ${filter.shiftCode?sql`AND re.shift_code=${filter.shiftCode}`:sql``}
          ${filter.crusherId?sql`AND re.crusher_id=${filter.crusherId}::uuid`:sql``}
          ${filter.vendorId?sql`AND re.vendor_id=${filter.vendorId}::uuid`:sql``}
        ORDER BY re.event_ts DESC
      `);
      return (rows as unknown as Array<Record<string,unknown>>).map(r=>({eventId:str(r.event_id),eventTs:date(r.event_ts),operationDate:str(r.operation_date),shiftCode:str(r.shift_code) as ShiftCode,crusherId:str(r.crusher_id),crusherName:str(r.crusher_name),vendorId:nullable(r.vendor_id),vendorName:nullable(r.vendor_name),aaId:nullable(r.aa_id),aaUnitNo:nullable(r.aa_unit_no),status:str(r.status) as 'EXCEPTION_UNASSIGNED'|'AMBIGUOUS',reason:nullable(r.reason)}));
    },
    async listExceptionAssignmentCandidates(eventId){
      const rows=await db.execute(sql`
        WITH e AS (
          SELECT id,operation_date,shift_code,crusher_id,vendor_id,aa_id,status,event_type,event_ts
          FROM retase_events WHERE id=${eventId}::uuid
        )
        SELECT la.id AS assignment_id,la.assignment_origin,la.report_id,vsr.version AS report_version,la.shift_code,la.vendor_id,v.name AS vendor_name,
               la.am_id,am.unit_no AS am_unit_no,la.source_id,s.name AS source_name,la.block_snapshot,la.material_kind,la.material_category,
               e.crusher_id,c.name AS crusher_name,la.valid_from,la.valid_to,e.event_ts,sh.start_time AS shift_start,sh.end_time AS shift_end,sh.crosses_midnight,
               EXISTS(SELECT 1 FROM loading_assignment_aas laa WHERE laa.assignment_id=la.id AND laa.aa_id=e.aa_id AND laa.active=true) AS aa_listed
        FROM e
        JOIN loading_assignments la ON la.operation_date=e.operation_date AND la.shift_code=e.shift_code AND (la.crusher_id=e.crusher_id OR la.crusher_id IS NULL) AND la.status='ACTIVE'
        JOIN shifts sh ON sh.code=la.shift_code AND sh.active=true
        LEFT JOIN vendor_shift_reports vsr ON vsr.id=la.report_id
        JOIN vendors v ON v.id=la.vendor_id JOIN equipment am ON am.id=la.am_id JOIN crushers c ON c.id=e.crusher_id AND c.material_kind=la.material_kind
        LEFT JOIN sources s ON s.id=la.source_id
        WHERE e.event_type='DUMP' AND e.status IN ('EXCEPTION_UNASSIGNED','AMBIGUOUS') AND (e.vendor_id IS NULL OR la.vendor_id=e.vendor_id)
          AND (la.assignment_origin='OPERATIONAL' OR vsr.status='SUBMITTED')
        ORDER BY aa_listed DESC,CASE WHEN la.assignment_origin='OPERATIONAL' THEN 0 ELSE 1 END,vsr.version DESC NULLS LAST,am.unit_no,la.created_at
      `);
      return (rows as unknown as Array<Record<string,unknown>>).filter(r=>{const shift={code:str(r.shift_code),name:str(r.shift_code),startTime:str(r.shift_start).slice(0,5),endTime:str(r.shift_end).slice(0,5),crossesMidnight:Boolean(r.crosses_midnight),active:true};const point=localPartsAt(date(r.event_ts)).minute;return assignmentActiveAtLocalMinute(r.valid_from?str(r.valid_from).slice(0,5):null,r.valid_to?str(r.valid_to).slice(0,5):null,shift,point);}).map(r=>({assignmentId:str(r.assignment_id),assignmentOrigin:str(r.assignment_origin) as ReconciliationAssignmentRecord['assignmentOrigin'],reportId:nullable(r.report_id),reportVersion:r.report_version==null?null:num(r.report_version),vendorId:str(r.vendor_id),vendorName:str(r.vendor_name),amId:str(r.am_id),amUnitNo:str(r.am_unit_no),sourceId:nullable(r.source_id),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot),materialKind:str(r.material_kind) as MaterialKind,materialCategory:str(r.material_category),crusherId:str(r.crusher_id),crusherName:str(r.crusher_name),aaListed:Boolean(r.aa_listed)}));
    },
    async resolveExceptionEvent(input){
      await db.transaction(async(tx)=>{
        const eventRows=await tx.execute(sql`SELECT * FROM retase_events WHERE id=${input.eventId}::uuid FOR UPDATE`);const e=(eventRows as unknown as Array<Record<string,unknown>>)[0];
        if(!e)throw new Error('Retase exception event tidak ditemukan.');if(str(e.event_type)!=='DUMP'||!['EXCEPTION_UNASSIGNED','AMBIGUOUS'].includes(str(e.status)))throw new Error('Event bukan exception DUMP yang dapat direconcile.');
        const consumed=await tx.execute(sql`SELECT 1 FROM qc_retase_allocation_events WHERE event_id=${input.eventId}::uuid AND active=true LIMIT 1`);if((consumed as unknown as Array<unknown>).length)throw new Error('Event sudah terikat ke Retase Allocation.');
        const assignmentRows=await tx.execute(sql`
          SELECT la.*,vsr.version AS report_version,vsr.status AS report_status,v.name AS vendor_name,am.unit_no AS am_unit_no,c.name AS crusher_name,s.name AS source_name,p.code AS pile_code,p.name AS pile_name,sh.start_time AS shift_start,sh.end_time AS shift_end,sh.crosses_midnight,
                 laa.id AS assignment_aa_id,aa.unit_no AS aa_unit_no
          FROM loading_assignments la LEFT JOIN vendor_shift_reports vsr ON vsr.id=la.report_id JOIN vendors v ON v.id=la.vendor_id
          JOIN equipment am ON am.id=la.am_id JOIN crushers c ON c.id=${str(e.crusher_id)}::uuid AND c.material_kind=la.material_kind JOIN shifts sh ON sh.code=la.shift_code LEFT JOIN sources s ON s.id=la.source_id LEFT JOIN piles p ON p.id=la.pile_id
          LEFT JOIN loading_assignment_aas laa ON laa.assignment_id=la.id AND laa.aa_id=${e.aa_id?sql`${str(e.aa_id)}::uuid`:sql`NULL`} AND laa.active=true
          LEFT JOIN equipment aa ON aa.id=${e.aa_id?sql`${str(e.aa_id)}::uuid`:sql`NULL`}
          WHERE la.id=${input.assignmentId}::uuid FOR UPDATE OF la
        `);
        const a=(assignmentRows as unknown as Array<Record<string,unknown>>)[0];if(!a)throw new Error('Loading assignment tidak ditemukan.');if((str(a.assignment_origin)!=='OPERATIONAL'&&str(a.report_status)!=='SUBMITTED')||str(a.status)!=='ACTIVE')throw new Error('Loading assignment bukan effective SUBMITTED/OPERATIONAL.');
        if(str(a.operation_date)!==str(e.operation_date)||str(a.shift_code)!==str(e.shift_code)||(a.crusher_id!=null&&str(a.crusher_id)!==str(e.crusher_id)))throw new Error('Assignment tidak sesuai operation date / shift / crusher event.');
        if(e.vendor_id&&str(a.vendor_id)!==str(e.vendor_id))throw new Error('Assignment tidak sesuai vendor event.');
        const shift={code:str(a.shift_code),name:str(a.shift_code),startTime:str(a.shift_start).slice(0,5),endTime:str(a.shift_end).slice(0,5),crossesMidnight:Boolean(a.crosses_midnight),active:true};const point=localPartsAt(date(e.event_ts)).minute;if(!assignmentActiveAtLocalMinute(a.valid_from?str(a.valid_from).slice(0,5):null,a.valid_to?str(a.valid_to).slice(0,5):null,shift,point))throw new Error('Assignment tidak aktif pada timestamp event.');
        await tx.execute(sql`UPDATE retase_events SET report_id=${a.report_id?sql`${str(a.report_id)}::uuid`:sql`NULL`},report_version=${a.report_version==null?sql`NULL`:num(a.report_version)},assignment_id=${input.assignmentId}::uuid,assignment_aa_id=${a.assignment_aa_id?sql`${str(a.assignment_aa_id)}::uuid`:sql`NULL`},assignment_origin=${str(a.assignment_origin)},vendor_id=${str(a.vendor_id)}::uuid,am_id=${str(a.am_id)}::uuid,source_id=${a.source_id?sql`${str(a.source_id)}::uuid`:sql`NULL`},pile_id=${a.pile_id?sql`${str(a.pile_id)}::uuid`:sql`NULL`},block_snapshot=${nullable(a.block_snapshot)},material_kind=${str(a.material_kind)}::material_kind,material_category=${str(a.material_category)},vendor_name_snapshot=${str(a.vendor_name)},am_unit_no_snapshot=${str(a.am_unit_no)},aa_unit_no_snapshot=coalesce(aa_unit_no_snapshot,${nullable(a.aa_unit_no)}),status='VALID',resolved_by=${input.actorUserId}::uuid,resolved_at=now(),resolution_reason=${input.reason} WHERE id=${input.eventId}::uuid`);
        await tx.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot,action:'RESOLVE',entityType:'RETASE_EVENT_EXCEPTION',entityId:input.eventId,beforeJson:{status:str(e.status),assignmentId:nullable(e.assignment_id)},afterJson:{status:'VALID',assignmentId:input.assignmentId,assignmentAaId:nullable(a.assignment_aa_id)},reason:input.reason,requestId:input.requestId});
      });
    },
    async listAssignmentEvents(assignmentId){const rows=await db.execute(sql`SELECT re.id,re.event_ts,coalesce(re.aa_unit_no_snapshot,aa.unit_no) AS aa_unit_no,re.delta,re.event_type,re.status,u.display_name AS created_by_name,re.reason FROM retase_events re JOIN users u ON u.id=re.created_by LEFT JOIN equipment aa ON aa.id=re.aa_id WHERE re.assignment_id=${assignmentId}::uuid ORDER BY re.event_ts`);return (rows as unknown as Array<Record<string,unknown>>).map(r=>({id:str(r.id),eventTs:date(r.event_ts),aaUnitNo:nullable(r.aa_unit_no),delta:num(r.delta),eventType:str(r.event_type),status:str(r.status),createdByName:str(r.created_by_name),reason:nullable(r.reason)}));},
    getAllocation:allocationById,
    async createAllocation(input){
      const rows=await db.execute(sql`SELECT operation_date,shift_code,crusher_id,vendor_id FROM loading_assignments WHERE id=${input.assignmentId}::uuid LIMIT 1`);const a=(rows as unknown as Array<Record<string,unknown>>)[0];if(!a)throw new Error('Assignment tidak ditemukan.');
      const [row]=await db.insert(qcRetaseAllocations).values({assignmentId:input.assignmentId,operationDate:str(a.operation_date),shiftCode:str(a.shift_code),crusherId:nullable(a.crusher_id),vendorId:str(a.vendor_id),sampleId:input.sampleId,mappingStatus:input.candidateCount>1?'AMBIGUOUS':'RESERVED',observedRetase:input.observedRetase,approvedRetase:input.approvedRetase,candidateCount:input.candidateCount,note:input.note,createdBy:input.createdBy,updatedBy:input.createdBy}).returning({id:qcRetaseAllocations.id});if(!row)throw new Error('Gagal membuat allocation.');const out=await allocationById(row.id);if(!out)throw new Error('Allocation gagal direload.');return out;
    },
    async autoReserveSingleCandidate(input){
      const result=await db.transaction(async(tx)=>{
        await tx.execute(sql`SELECT id FROM loading_assignments WHERE id=${input.assignmentId}::uuid FOR UPDATE`);
        const existingRows=await tx.execute(sql`SELECT id,mapping_status,sample_id,approved_retase,candidate_count FROM qc_retase_allocations WHERE assignment_id=${input.assignmentId}::uuid AND mapping_status IN ('SUGGESTED','RESERVED','AMBIGUOUS') ORDER BY created_at LIMIT 1 FOR UPDATE`);
        const existing=(existingRows as unknown as Array<Record<string,unknown>>)[0];
        if(existing){
          const existingSample=nullable(existing.sample_id);
          if(existingSample&&existingSample!==input.sampleId)return {id:str(existing.id),changed:false};
          const approved=existing.approved_retase==null&&input.observedRetase>0?input.observedRetase:Number(existing.approved_retase??0);
          const changed=str(existing.mapping_status)!=='RESERVED'||existingSample!==input.sampleId||num(existing.candidate_count)!==1||(existing.approved_retase==null&&approved>0);
          if(changed)await tx.execute(sql`UPDATE qc_retase_allocations SET sample_id=${input.sampleId}::uuid,mapping_status='RESERVED',observed_retase=${input.observedRetase},approved_retase=${existing.approved_retase==null?(input.observedRetase>0?sql`${input.observedRetase}`:sql`NULL`):sql`approved_retase`},candidate_count=1,note=coalesce(note,'Auto-mapped dari satu raw sample candidate.'),updated_by=${input.createdBy}::uuid,updated_at=now() WHERE id=${str(existing.id)}::uuid`);
          return {id:str(existing.id),changed};
        }
        const rows=await tx.execute(sql`SELECT operation_date,shift_code,crusher_id,vendor_id FROM loading_assignments WHERE id=${input.assignmentId}::uuid`);const a=(rows as unknown as Array<Record<string,unknown>>)[0];if(!a)return null;
        const inserted=await tx.execute(sql`INSERT INTO qc_retase_allocations(operation_date,shift_code,crusher_id,vendor_id,assignment_id,sample_id,mapping_status,observed_retase,approved_retase,candidate_count,note,created_by,updated_by) VALUES(${str(a.operation_date)},${str(a.shift_code)},${a.crusher_id?sql`${str(a.crusher_id)}::uuid`:sql`NULL`},${str(a.vendor_id)}::uuid,${input.assignmentId}::uuid,${input.sampleId}::uuid,'RESERVED'::mapping_status,${input.observedRetase},${input.observedRetase>0?sql`${input.observedRetase}`:sql`NULL`},1,'Auto-mapped dari satu raw sample candidate.',${input.createdBy}::uuid,${input.createdBy}::uuid) RETURNING id`);
        const row=(inserted as unknown as Array<Record<string,unknown>>)[0];return row?{id:str(row.id),changed:true}:null;
      });
      if(!result)return null;const out=await allocationById(result.id);if(!out)throw new Error('Allocation auto-reserve gagal direload.');return {allocation:out,changed:result.changed};
    },
    async updateAllocation(id,patch){
      const values:Record<string,unknown>={updatedAt:new Date(),updatedBy:patch.updatedBy,confirmedBy:null,confirmedAt:null,reviewRequired:false,reviewReason:null};
      if('sampleId'in patch)values.sampleId=patch.sampleId;if('approvedRetase'in patch)values.approvedRetase=patch.approvedRetase;if('candidateCount'in patch){values.candidateCount=patch.candidateCount;values.mappingStatus=(patch.candidateCount??0)>1?'AMBIGUOUS':'RESERVED';}if('note'in patch)values.note=patch.note;
      const [r]=await db.update(qcRetaseAllocations).set(values).where(eq(qcRetaseAllocations.id,id)).returning({id:qcRetaseAllocations.id});return r?allocationById(r.id):null;
    },
    async confirmAllocation(id,input){
      await db.transaction(async(tx)=>{
        const locked=await tx.execute(sql`SELECT qa.*,la.report_id,la.assignment_origin,r.status AS report_status FROM qc_retase_allocations qa JOIN loading_assignments la ON la.id=qa.assignment_id LEFT JOIN vendor_shift_reports r ON r.id=la.report_id WHERE qa.id=${id}::uuid FOR UPDATE OF qa,la`);const a=(locked as unknown as Array<Record<string,unknown>>)[0];if(!a)throw new Error('Allocation tidak ditemukan.');if(str(a.mapping_status)==='CONSUMED')throw new Error('Allocation sudah CONSUMED.');if(str(a.assignment_origin)!=='OPERATIONAL'&&str(a.report_status)!=='SUBMITTED')throw new Error('Upstream assignment bukan effective SUBMITTED/OPERATIONAL.');
        const observedRows=await tx.execute(sql`SELECT count(*)::int AS observed FROM retase_events WHERE assignment_id=${str(a.assignment_id)}::uuid AND event_type='DUMP' AND status='VALID'`);const observed=num((observedRows as unknown as Array<Record<string,unknown>>)[0]?.observed);
        const reserveRows=await tx.execute(sql`SELECT coalesce(sum(CASE WHEN mapping_status IN ('RESERVED','CONFIRMED','REVIEW_REQUIRED') THEN approved_retase WHEN mapping_status='CONSUMED' THEN consumed_retase ELSE 0 END),0)::int AS reserved FROM qc_retase_allocations WHERE assignment_id=${str(a.assignment_id)}::uuid AND id<>${id}::uuid`);const reserved=num((reserveRows as unknown as Array<Record<string,unknown>>)[0]?.reserved);
        if(input.approvedRetase>observed-reserved)throw new Error(`Approved Retase ${input.approvedRetase} melebihi remaining retase ${Math.max(0,observed-reserved)}.`);
        await tx.update(qcRetaseAllocations).set({mappingStatus:'CONFIRMED',observedRetase:observed,approvedRetase:input.approvedRetase,confirmedBy:input.actorUserId,confirmedAt:new Date(),reviewRequired:false,reviewReason:null,updatedBy:input.actorUserId,updatedAt:new Date()}).where(eq(qcRetaseAllocations.id,id));
        await tx.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot,action:'CONFIRM',entityType:'QC_RETASE_ALLOCATION',entityId:id,afterJson:{approvedRetase:input.approvedRetase,observedRetase:observed},reason:input.reason??null,requestId:input.requestId});
      });const out=await allocationById(id);if(!out)throw new Error('Allocation gagal direload.');return out;
    },
    async markReviewRequiredForDrift(operationDate){
      const upstream=await db.execute(sql`UPDATE qc_retase_allocations qa SET review_required=true,review_reason='UPSTREAM_REPORT_SUPERSEDED',mapping_status=CASE WHEN qa.mapping_status='CONSUMED' THEN 'CONSUMED'::mapping_status ELSE 'REVIEW_REQUIRED'::mapping_status END,updated_at=now() FROM loading_assignments la JOIN vendor_shift_reports r ON r.id=la.report_id WHERE qa.assignment_id=la.id AND qa.operation_date=${operationDate}::date AND r.status<>'SUBMITTED' AND qa.mapping_status IN ('SUGGESTED','RESERVED','AMBIGUOUS','CONFIRMED','CONSUMED','REVIEW_REQUIRED') AND (qa.review_required=false OR qa.review_reason IS DISTINCT FROM 'UPSTREAM_REPORT_SUPERSEDED') RETURNING qa.id`);
      const operational=await db.execute(sql`UPDATE qc_retase_allocations qa SET review_required=true,review_reason='OPERATIONAL_ASSIGNMENT_INACTIVE',mapping_status=CASE WHEN qa.mapping_status='CONSUMED' THEN 'CONSUMED'::mapping_status ELSE 'REVIEW_REQUIRED'::mapping_status END,updated_at=now() FROM loading_assignments la WHERE qa.assignment_id=la.id AND qa.operation_date=${operationDate}::date AND la.assignment_origin='OPERATIONAL' AND la.status<>'ACTIVE' AND qa.mapping_status IN ('SUGGESTED','RESERVED','AMBIGUOUS','CONFIRMED','CONSUMED','REVIEW_REQUIRED') AND (qa.review_required=false OR qa.review_reason IS DISTINCT FROM 'OPERATIONAL_ASSIGNMENT_INACTIVE') RETURNING qa.id`);
      const reversed=await db.execute(sql`UPDATE qc_retase_allocations qa SET review_required=true,review_reason='CONSUMED_EVENT_REVERSED',updated_at=now() WHERE qa.operation_date=${operationDate}::date AND EXISTS (SELECT 1 FROM qc_retase_allocation_events qae JOIN retase_events re ON re.id=qae.event_id WHERE qae.allocation_id=qa.id AND re.status='REVERSED') AND (qa.review_required=false OR qa.review_reason IS DISTINCT FROM 'CONSUMED_EVENT_REVERSED') RETURNING qa.id`);
      const over=await db.execute(sql`WITH observed AS (SELECT assignment_id,count(*) FILTER (WHERE event_type='DUMP' AND status='VALID')::int AS n FROM retase_events WHERE operation_date=${operationDate}::date GROUP BY assignment_id),reserved AS (SELECT assignment_id,sum(CASE WHEN mapping_status IN ('RESERVED','CONFIRMED','REVIEW_REQUIRED') THEN coalesce(approved_retase,0) WHEN mapping_status='CONSUMED' THEN consumed_retase ELSE 0 END)::int AS n FROM qc_retase_allocations WHERE operation_date=${operationDate}::date GROUP BY assignment_id) UPDATE qc_retase_allocations qa SET review_required=true,review_reason='OBSERVED_RETASE_DECREASED',mapping_status=CASE WHEN qa.mapping_status='CONSUMED' THEN 'CONSUMED'::mapping_status ELSE 'REVIEW_REQUIRED'::mapping_status END,updated_at=now() FROM reserved r LEFT JOIN observed o ON o.assignment_id=r.assignment_id WHERE qa.assignment_id=r.assignment_id AND r.n>coalesce(o.n,0) AND qa.mapping_status IN ('RESERVED','CONFIRMED','CONSUMED','REVIEW_REQUIRED') RETURNING qa.id`);
      return (upstream as unknown as Array<unknown>).length+(operational as unknown as Array<unknown>).length+(reversed as unknown as Array<unknown>).length+(over as unknown as Array<unknown>).length;
    },
    async listWorkbenchSuggestions(input){
      const rows=await db.execute(sql`SELECT qa.id AS allocation_id,qa.assignment_id,qa.sample_id,rs.sample_id AS sample_code,qa.approved_retase,v.name AS vendor_name,c.name AS crusher_name,am.unit_no AS am_unit_no,s.name AS source_name,la.block_snapshot FROM qc_retase_allocations qa JOIN raw_samples rs ON rs.id=qa.sample_id JOIN loading_assignments la ON la.id=qa.assignment_id JOIN vendors v ON v.id=qa.vendor_id LEFT JOIN crushers c ON c.id=qa.crusher_id JOIN equipment am ON am.id=la.am_id LEFT JOIN sources s ON s.id=la.source_id WHERE qa.operation_date=${input.operationDate}::date AND rs.material_kind=${input.materialKind} AND qa.mapping_status='CONFIRMED' AND qa.review_required=false AND qa.mix_id IS NULL AND qa.approved_retase>0 ORDER BY rs.sample_id,qa.created_at`);
      const map=new Map<string,{sampleId:string;sampleCode:string;mappedRetase:number;sources:any[]}>();for(const r of rows as unknown as Array<Record<string,unknown>>){const key=str(r.sample_id),x=map.get(key)??{sampleId:key,sampleCode:str(r.sample_code),mappedRetase:0,sources:[]};x.mappedRetase+=num(r.approved_retase);x.sources.push({allocationId:str(r.allocation_id),assignmentId:str(r.assignment_id),approvedRetase:num(r.approved_retase),vendorName:str(r.vendor_name),crusherName:nullable(r.crusher_name)??'Lintas crusher',amUnitNo:str(r.am_unit_no),sourceName:nullable(r.source_name),blockSnapshot:nullable(r.block_snapshot)});map.set(key,x);}return [...map.values()];
    },
    async appendAudit(input){await db.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot??null,action:input.action,entityType:input.entityType,entityId:input.entityId,beforeJson:input.beforeJson,afterJson:input.afterJson,reason:input.reason??null,requestId:input.requestId});},
  };
}
