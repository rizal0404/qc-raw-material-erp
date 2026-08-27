import { and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Chemistry, MaterialKind, ClayRetaseUse } from '@qc/contracts';
import { calculateQuality, chemistryEquals, LEGACY_BASELINE_QAF_RULES } from '@qc/domain';
import type { MixView, QcRepository, RawSampleRecord, RawSampleWriteInput, SaveMixRepositoryInput, TonPerRetaseRule } from '@qc/domain';
import type * as Schema from '../schema/index';
import {
  auditLogs, mixItemChemistryRevisions, mixItems, mixes, piles, plants, qualityTargets, rawSamples, tonPerRetaseRules, users,
  qcRetaseAllocations, qcRetaseAllocationEvents, mixItemRetaseAllocations, retaseEvents, mixItemClayRetaseSources,
} from '../schema/index';

const CHEM_KEYS = ['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;
function n(value: unknown): number | null { if (value === null || value === undefined || value === '') return null; const x=Number(value); return Number.isFinite(x)?x:null; }
function nn(value: unknown): number { const x=Number(value); return Number.isFinite(x)?x:0; }
function chemistryFromRow(row: Record<string, unknown>): Chemistry { return Object.fromEntries(CHEM_KEYS.map((k)=>[k,n(row[k])])) as Chemistry; }
function rawSampleRecord(row: typeof rawSamples.$inferSelect): RawSampleRecord {
  return {
    id: row.id, sampleId: row.sampleId, materialKind: row.materialKind, operationDate: row.operationDate,
    noSample: row.noSample, sourceShift: row.sourceShift, typeGrade: row.typeGrade, vendorId: row.vendorId, vendorSnapshot: row.vendorSnapshot,
    sourceId: row.sourceId, sourceSnapshot: row.sourceSnapshot, plantId: row.plantId, loaderUnitNo: row.loaderUnitNo, block: row.block, direction: row.direction,
    chemistry: chemistryFromRow(row as unknown as Record<string, unknown>), note: row.note, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
function sampleValues(input: RawSampleWriteInput) {
  return {
    sampleId: input.sampleId, materialKind: input.materialKind, operationDate: input.operationDate, noSample: input.noSample, sourceShift: input.sourceShift,
    typeGrade: input.typeGrade, vendorId: input.vendorId, vendorSnapshot: input.vendorSnapshot, sourceId: input.sourceId, sourceSnapshot: input.sourceSnapshot,
    plantId: input.plantId, loaderUnitNo: input.loaderUnitNo, block: input.block, direction: input.direction,
    sio2: input.chemistry.sio2?.toString() ?? null, al2o3: input.chemistry.al2o3?.toString() ?? null, fe2o3: input.chemistry.fe2o3?.toString() ?? null,
    cao: input.chemistry.cao?.toString() ?? null, mgo: input.chemistry.mgo?.toString() ?? null, k2o: input.chemistry.k2o?.toString() ?? null,
    na2o: input.chemistry.na2o?.toString() ?? null, so3: input.chemistry.so3?.toString() ?? null, h2o: input.chemistry.h2o?.toString() ?? null,
    note: input.note,
  };
}

export function createQcRepository(db: PostgresJsDatabase<typeof Schema>): QcRepository {
  async function pileContext(id: string) {
    const [row] = await db.select({ id:piles.id,code:piles.code,name:piles.name,materialKind:piles.materialKind,plantId:piles.plantId,plantCode:plants.code,plantName:plants.name,className:piles.className })
      .from(piles).leftJoin(plants,eq(plants.id,piles.plantId)).where(eq(piles.id,id)).limit(1);
    return row ?? null;
  }
  async function getMixInternal(mixId: string): Promise<MixView | null> {
    const [m] = await db.select({
      id:mixes.id,mixCode:mixes.mixCode,materialKind:mixes.materialKind,operationDate:mixes.operationDate,pileId:mixes.pileId,pileCode:piles.code,pileName:piles.name,
      plantId:mixes.plantId,plantCode:plants.code,plantName:plants.name,className:mixes.classNameSnapshot,shiftCode:mixes.shiftCode,batchNo:mixes.batchNo,tiangKe:mixes.tiangKe,
      pileCycle:mixes.pileCycle,defaultTonPerRetase:mixes.defaultTonPerRetase,status:mixes.status,replacesMixId:mixes.replacesMixId,note:mixes.note,createdAt:mixes.createdAt,updatedAt:mixes.updatedAt,
    }).from(mixes).innerJoin(piles,eq(piles.id,mixes.pileId)).leftJoin(plants,eq(plants.id,mixes.plantId)).where(eq(mixes.id,mixId)).limit(1);
    if (!m) return null;
    const rows = await db.select({
      id:mixItems.id,rawSampleId:rawSamples.id,sampleId:rawSamples.sampleId,noSample:rawSamples.noSample,typeGrade:rawSamples.typeGrade,
      vendorSnapshot:rawSamples.vendorSnapshot,sourceSnapshot:rawSamples.sourceSnapshot,retase:mixItems.retase,tonPerRetase:mixItems.tonPerRetase,tonnage:mixItems.tonnage,
      chemistry:mixItems.chemistrySnapshot,note:mixItems.note,revisionCount:count(mixItemChemistryRevisions.id),
    }).from(mixItems).innerJoin(rawSamples,eq(rawSamples.id,mixItems.sampleId)).leftJoin(mixItemChemistryRevisions,eq(mixItemChemistryRevisions.mixItemId,mixItems.id))
      .where(eq(mixItems.mixId,mixId)).groupBy(mixItems.id,rawSamples.id).orderBy(asc(rawSamples.sampleId));
    const itemIds=rows.map((r)=>r.id);const allocationMap=new Map<string,{ids:string[];retase:number}>();
    if(itemIds.length){const links=await db.execute(sql`SELECT mix_item_id,allocation_id,retase_consumed FROM mix_item_retase_allocations WHERE active=true AND mix_item_id IN (${sql.join(itemIds.map(id=>sql`${id}::uuid`),sql`,`)}) ORDER BY created_at`);for(const x of links as unknown as Array<Record<string,unknown>>){const key=String(x.mix_item_id),v=allocationMap.get(key)??{ids:[],retase:0};v.ids.push(String(x.allocation_id));v.retase+=Number(x.retase_consumed??0);allocationMap.set(key,v);}}
    const clayLinks=await db.select({mixItemId:mixItemClayRetaseSources.mixItemId,columnId:mixItemClayRetaseSources.columnId,retase:mixItemClayRetaseSources.retaseConsumed})
      .from(mixItemClayRetaseSources).innerJoin(mixItems,eq(mixItems.id,mixItemClayRetaseSources.mixItemId)).where(eq(mixItems.mixId,mixId));
    const clayMap=new Map<string,ClayRetaseUse[]>();
    for(const link of clayLinks)clayMap.set(link.mixItemId,[...(clayMap.get(link.mixItemId)??[]),{columnId:link.columnId,retase:link.retase}]);
    return {
      ...m, defaultTonPerRetase: Number(m.defaultTonPerRetase),
      items: rows.map((r)=>{ const chemistry=r.chemistry as Chemistry;const allocation=allocationMap.get(r.id)??{ids:[],retase:0}; return { id:r.id,rawSampleId:r.rawSampleId,sampleId:r.sampleId,noSample:r.noSample,typeGrade:r.typeGrade,vendorSnapshot:r.vendorSnapshot,sourceSnapshot:r.sourceSnapshot,retase:r.retase,tonPerRetase:Number(r.tonPerRetase),tonnage:Number(r.tonnage),chemistry,quality:calculateQuality(chemistry),note:r.note,hasChemistryRevision:Number(r.revisionCount)>0,retaseAllocationIds:allocation.ids,mappedRetaseConsumed:allocation.retase,clayRetaseSources:clayMap.get(r.id)??[] }; }),
    };
  }

  async function releaseRetaseConsumptionForMix(tx:any,mixId:string,reason:string,actorUserId:string){
    await tx.execute(sql`UPDATE mix_item_clay_retase_sources c SET active=false,released_at=now(),released_reason=${reason}
      FROM mix_items mi WHERE mi.id=c.mix_item_id AND mi.mix_id=${mixId}::uuid AND c.active`);
    const links=await tx.execute(sql`SELECT mira.allocation_id FROM mix_item_retase_allocations mira JOIN mix_items mi ON mi.id=mira.mix_item_id WHERE mi.mix_id=${mixId}::uuid AND mira.active=true FOR UPDATE`);
    const allocationIds=(links as unknown as Array<Record<string,unknown>>).map(r=>String(r.allocation_id));
    if(!allocationIds.length)return;
    await tx.execute(sql`UPDATE qc_retase_allocation_events SET active=false,released_at=now(),released_reason=${reason} WHERE active=true AND allocation_id IN (${sql.join(allocationIds.map(id=>sql`${id}::uuid`),sql`,`)})`);
    await tx.execute(sql`UPDATE mix_item_retase_allocations SET active=false,released_at=now(),released_reason=${reason} WHERE active=true AND allocation_id IN (${sql.join(allocationIds.map(id=>sql`${id}::uuid`),sql`,`)})`);
    await tx.execute(sql`UPDATE qc_retase_allocations SET mapping_status=CASE WHEN review_required THEN 'REVIEW_REQUIRED'::mapping_status ELSE 'CONFIRMED'::mapping_status END,consumed_retase=0,mix_id=NULL,consumed_at=NULL,updated_by=${actorUserId}::uuid,updated_at=now() WHERE id IN (${sql.join(allocationIds.map(id=>sql`${id}::uuid`),sql`,`)})`);
  }

  async function consumeRetaseAllocationsForItem(tx:any,input:{mixId:string;mixItemId:string;sampleId:string;retase:number;allocationIds:string[];overrideReason:string|null;actorUserId:string}){
    const ids=[...new Set(input.allocationIds)];if(!ids.length)return;
    const rows=await tx.execute(sql`SELECT qa.* FROM qc_retase_allocations qa WHERE qa.id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)}) ORDER BY qa.created_at FOR UPDATE`);
    const allocations=rows as unknown as Array<Record<string,unknown>>;if(allocations.length!==ids.length)throw new Error('Satu atau lebih Retase Allocation tidak ditemukan.');
    let approvedTotal=0;for(const a of allocations){if(String(a.mapping_status)!=='CONFIRMED'||Boolean(a.review_required)||a.mix_id)throw new Error('Retase Allocation harus CONFIRMED, belum consumed, dan tidak REVIEW_REQUIRED.');if(String(a.sample_id)!==input.sampleId)throw new Error('Retase Allocation tidak sesuai Sample_ID pada Mix Item.');approvedTotal+=Number(a.approved_retase??0);}
    if(input.retase>approvedTotal)throw new Error(`Retase final ${input.retase} melebihi mapped/approved retase ${approvedTotal}. Perbarui reconciliation terlebih dahulu.`);
    if(input.retase!==approvedTotal&&!input.overrideReason)throw new Error('Reason wajib jika final Retase berbeda dari mapped/approved retase.');
    let remaining=input.retase;
    for(const a of allocations){if(remaining<=0)break;const approved=Number(a.approved_retase??0);const contribution=Math.min(approved,remaining);if(contribution<=0)continue;
      const eventRows=await tx.execute(sql`SELECT re.id FROM retase_events re LEFT JOIN qc_retase_allocation_events qae ON qae.event_id=re.id AND qae.active=true WHERE re.assignment_id=${String(a.assignment_id)}::uuid AND re.event_type='DUMP' AND re.status='VALID' AND qae.id IS NULL ORDER BY re.event_ts,re.id FOR UPDATE OF re SKIP LOCKED LIMIT ${contribution}`);
      const eventIds=(eventRows as unknown as Array<Record<string,unknown>>).map(r=>String(r.id));if(eventIds.length!==contribution)throw new Error(`Retase valid yang belum digunakan tidak cukup untuk allocation ${String(a.id)}.`);
      for(const eventId of eventIds)await tx.insert(qcRetaseAllocationEvents).values({allocationId:String(a.id),eventId,mixItemId:input.mixItemId,active:true});
      await tx.insert(mixItemRetaseAllocations).values({mixItemId:input.mixItemId,allocationId:String(a.id),retaseConsumed:contribution,overrideReason:input.retase!==approvedTotal?input.overrideReason:null,active:true});
      await tx.update(qcRetaseAllocations).set({mappingStatus:'CONSUMED',consumedRetase:contribution,mixId:input.mixId,consumedAt:new Date(),overrideReason:input.retase!==approvedTotal?input.overrideReason:null,updatedBy:input.actorUserId,updatedAt:new Date()}).where(eq(qcRetaseAllocations.id,String(a.id)));
      remaining-=contribution;
    }
    if(remaining!==0)throw new Error('Retase mapped gagal dialokasikan secara penuh ke event ledger.');
  }

  async function insertMix(tx: any, input: SaveMixRepositoryInput): Promise<string> {
    const [pile] = await tx.select({ plantId:piles.plantId,className:piles.className }).from(piles).where(eq(piles.id,input.pileId)).limit(1);
    if (!pile) throw new Error('Pile tidak ditemukan.');
    const locationRef = input.materialKind==='LS' ? String(input.batchNo ?? '') : String(input.tiangKe ?? '');
    const [mix] = await tx.insert(mixes).values({
      mixCode:input.mixCode,materialKind:input.materialKind,operationDate:input.operationDate,pileId:input.pileId,plantId:pile.plantId,classNameSnapshot:pile.className,
      shiftCode:input.shiftCode,locationRef,batchNo:input.batchNo,tiangKe:input.tiangKe,pileCycle:input.pileCycle,defaultTonPerRetase:String(input.defaultTonPerRetase),
      replacesMixId:input.replacesMixId ?? null,note:input.note,createdBy:input.createdBy,updatedBy:input.createdBy,
    }).returning({id:mixes.id});
    if (!mix) throw new Error('Gagal membuat mix.');
    for (const item of input.items) {
      const [raw] = await tx.select().from(rawSamples).where(eq(rawSamples.id,item.rawSampleId)).limit(1);
      if (!raw) throw new Error(`Raw sample tidak ditemukan: ${item.rawSampleId}`);
      const rawChem = chemistryFromRow(raw as unknown as Record<string,unknown>);
      const tonnage = item.retase * item.tonPerRetase;
      const [createdItem] = await tx.insert(mixItems).values({ mixId:mix.id,sampleId:item.rawSampleId,retase:item.retase,tonPerRetase:String(item.tonPerRetase),tonnage:String(tonnage),chemistrySnapshot:item.chemistry,note:item.note }).returning({id:mixItems.id});
      if (!createdItem) throw new Error('Gagal membuat mix item.');
      if(input.materialKind==='CL'){
        if(!item.clayRetaseSources.length||item.retaseAllocationIds.length||item.clayRetaseSources.reduce((sum,x)=>sum+x.retase,0)!==item.retase)throw new Error('Clay retase sources must equal mix item retase.');
        await tx.insert(mixItemClayRetaseSources).values(item.clayRetaseSources.map(source=>({mixItemId:createdItem.id,columnId:source.columnId,retaseConsumed:source.retase})));
      }else{
        if(item.clayRetaseSources.length)throw new Error('Limestone cannot consume Clay retase.');
        await consumeRetaseAllocationsForItem(tx,{mixId:mix.id,mixItemId:createdItem.id,sampleId:item.rawSampleId,retase:item.retase,allocationIds:item.retaseAllocationIds,overrideReason:item.retaseOverrideReason,actorUserId:input.createdBy});
      }
      if (!chemistryEquals(rawChem,item.chemistry)) {
        if (!item.oxideChangeNote) throw new Error(`Note perubahan oksida wajib untuk ${raw.sampleId}.`);
        await tx.insert(mixItemChemistryRevisions).values({ mixItemId:createdItem.id,revisionNo:1,beforeSnapshot:rawChem,afterSnapshot:item.chemistry,reason:item.oxideChangeNote,changedBy:input.createdBy });
      }
    }
    return mix.id;
  }

  async function lockClayColumns(tx:any,input:SaveMixRepositoryInput,existingMixId?:string){
    const ids=[...new Set(input.items.flatMap(item=>item.clayRetaseSources.map(source=>source.columnId)))];
    if(!ids.length&&!existingMixId)return;
    // Acquire the union before release/consume so competing replaces lock in the
    // same order. The database triggers use these same column locks.
    await tx.execute(sql`SELECT c.id FROM clay_report_columns c WHERE
      ${ids.length?sql`c.id IN (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`,`)})`:sql`false`}
      ${existingMixId?sql`OR c.id IN (SELECT l.column_id FROM mix_item_clay_retase_sources l JOIN mix_items mi ON mi.id=l.mix_item_id WHERE mi.mix_id=${existingMixId}::uuid AND l.active)`:sql``}
      ORDER BY c.id FOR UPDATE`);
  }

  return {
    async listClayWorkbenchSources(operationDate,shiftCode){
      const rows=await db.execute(sql`SELECT c.id column_id,c.report_id,r.operation_date,r.shift_code,cr.name crusher_name,
        r.status report_status,c.status column_status,c.header_primary,c.header_secondary,c.vendor_id,c.vendor_name_snapshot vendor_name,
        c.source_id,c.source_name_snapshot source_name,b.total_retase,b.consumed_retase
        FROM clay_shift_reports r JOIN clay_report_columns c ON c.report_id=r.id JOIN crushers cr ON cr.id=r.crusher_id
        CROSS JOIN LATERAL clay_retase_balance(c.id) b
        WHERE r.operation_date=${operationDate}::date AND r.shift_code=${shiftCode} AND r.status<>'SUPERSEDED'
        ORDER BY cr.name,c.display_order,c.id`);
      return (rows as unknown as Record<string,unknown>[]).map(r=>({columnId:String(r.column_id),reportId:String(r.report_id),operationDate:String(r.operation_date),shiftCode:String(r.shift_code),crusherName:String(r.crusher_name),reportStatus:String(r.report_status),columnStatus:String(r.column_status),headerPrimary:String(r.header_primary),headerSecondary:r.header_secondary==null?null:String(r.header_secondary),vendorId:r.vendor_id==null?null:String(r.vendor_id),vendorName:r.vendor_name==null?null:String(r.vendor_name),sourceId:r.source_id==null?null:String(r.source_id),sourceName:r.source_name==null?null:String(r.source_name),totalRetase:Number(r.total_retase),consumedRetase:Number(r.consumed_retase),availableRetase:Math.max(0,Number(r.total_retase)-Number(r.consumed_retase))}));
    },
    async listRawSamples(filter) {
      const term=filter.search?.trim();
      const where=and(
        filter.materialKind?eq(rawSamples.materialKind,filter.materialKind):undefined,
        filter.operationDate?eq(rawSamples.operationDate,filter.operationDate):undefined,
        filter.vendorId?eq(rawSamples.vendorId,filter.vendorId):undefined,
        filter.sourceId?eq(rawSamples.sourceId,filter.sourceId):undefined,
        term?or(ilike(rawSamples.sampleId,`%${term}%`),ilike(rawSamples.noSample,`%${term}%`),ilike(rawSamples.vendorSnapshot,`%${term}%`),ilike(rawSamples.sourceSnapshot,`%${term}%`),ilike(rawSamples.typeGrade,`%${term}%`)):undefined,
      );
      const [items,totalRows]=await Promise.all([
        db.select().from(rawSamples).where(where).orderBy(desc(rawSamples.operationDate),asc(rawSamples.sampleId)).limit(filter.limit).offset(filter.offset),
        db.select({value:count()}).from(rawSamples).where(where),
      ]);
      return {items:items.map(rawSampleRecord),total:Number(totalRows[0]?.value??0)};
    },
    async findRawSampleById(id){ const [r]=await db.select().from(rawSamples).where(eq(rawSamples.id,id)).limit(1); return r?rawSampleRecord(r):null; },
    async findRawSampleBySampleId(sampleId){ const [r]=await db.select().from(rawSamples).where(sql`lower(${rawSamples.sampleId})=lower(${sampleId})`).limit(1); return r?rawSampleRecord(r):null; },
    async createRawSample(input){ const [r]=await db.insert(rawSamples).values(sampleValues(input)).returning(); if(!r)throw new Error('Gagal membuat sample.');return rawSampleRecord(r); },
    async updateRawSample(id,patch){
      const values: Record<string,unknown>={updatedAt:new Date()};
      const direct=['sampleId','materialKind','operationDate','noSample','sourceShift','typeGrade','vendorId','vendorSnapshot','sourceId','sourceSnapshot','plantId','loaderUnitNo','block','direction','note'] as const;
      for(const k of direct) if(k in patch) values[k]=(patch as Record<string,unknown>)[k];
      if(patch.chemistry){ for(const k of CHEM_KEYS) values[k]=patch.chemistry[k]?.toString()??null; }
      const [r]=await db.update(rawSamples).set(values).where(eq(rawSamples.id,id)).returning(); return r?rawSampleRecord(r):null;
    },
    async importRawSamples(rows,mode){
      const ids=rows.map(r=>r.sampleId.toLowerCase());
      const existing=ids.length?await db.select({id:rawSamples.id,sampleId:rawSamples.sampleId}).from(rawSamples).where(sql`lower(${rawSamples.sampleId}) IN (${sql.join(ids.map((id)=>sql`${id}`),sql`,`)})`):[];
      const existingSet=new Set(existing.map(r=>r.sampleId.toLowerCase())); let inserted=0,updated=0,skipped=0;
      await db.transaction(async(tx)=>{
        for(const row of rows){ const exists=existingSet.has(row.sampleId.toLowerCase()); if(exists&&mode==='INSERT_ONLY'){skipped++;continue;}
          if(exists){ await tx.update(rawSamples).set({...sampleValues(row),updatedAt:new Date()}).where(sql`lower(${rawSamples.sampleId})=lower(${row.sampleId})`); updated++; }
          else { await tx.insert(rawSamples).values(sampleValues(row)); inserted++; }
        }
      });
      return {inserted,updated,skipped};
    },
    async listTonPerRetaseRules(materialKind){
      const rows=await db.select().from(tonPerRetaseRules).where(and(materialKind?eq(tonPerRetaseRules.materialKind,materialKind):undefined,eq(tonPerRetaseRules.active,true))).orderBy(asc(tonPerRetaseRules.priority));
      return rows.map((r)=>({id:r.id,materialKind:r.materialKind,ruleType:r.ruleType,matchKey:r.matchKey,rate:Number(r.rate),priority:r.priority,active:r.active})) as TonPerRetaseRule[];
    },
    async getQafRules(plantId){
      const rows=await db.select().from(qualityTargets).where(and(eq(qualityTargets.active,true),plantId?or(eq(qualityTargets.plantId,plantId),sql`${qualityTargets.plantId} IS NULL`):sql`${qualityTargets.plantId} IS NULL`)).orderBy(sql`${qualityTargets.plantId} IS NOT NULL`,desc(qualityTargets.priority));
      const rules={...LEGACY_BASELINE_QAF_RULES};
      for(const r of rows){
        if(r.materialKind==='LS'&&r.className==='Filler'){ if(r.lsfMin!==null)rules.lsFillerMin=Number(r.lsfMin);if(r.lsfMax!==null)rules.lsFillerMax=Number(r.lsfMax);if(r.r2o3Max!==null)rules.lsR2O3Max=Number(r.r2o3Max); }
        else if(r.materialKind==='LS'&&(r.className==='PILE'||r.className===null)){ if(r.lsfMin!==null)rules.lsPileMin=Number(r.lsfMin);if(r.lsfMax!==null)rules.lsPileMax=Number(r.lsfMax);if(r.r2o3Max!==null)rules.lsR2O3Max=Number(r.r2o3Max); }
        else if(r.materialKind==='CL'){ if(r.smMin!==null)rules.clSmMin=Number(r.smMin);if(r.smMax!==null)rules.clSmMax=Number(r.smMax);if(r.amMin!==null)rules.clAmMin=Number(r.amMin);if(r.amMax!==null)rules.clAmMax=Number(r.amMax); }
      }
      return rules;
    },
    findPileContext:pileContext,
    async listMixes(filter){
      const term=filter.search?.trim();
      const where=and(filter.materialKind?eq(mixes.materialKind,filter.materialKind):undefined,filter.operationDate?eq(mixes.operationDate,filter.operationDate):undefined,filter.pileId?eq(mixes.pileId,filter.pileId):undefined,filter.status?eq(mixes.status,filter.status):undefined,term?ilike(mixes.mixCode,`%${term}%`):undefined);
      const selection={id:mixes.id,mixCode:mixes.mixCode,materialKind:mixes.materialKind,operationDate:mixes.operationDate,pileId:mixes.pileId,pileCode:piles.code,pileName:piles.name,plantId:mixes.plantId,plantCode:plants.code,plantName:plants.name,className:mixes.classNameSnapshot,shiftCode:mixes.shiftCode,batchNo:mixes.batchNo,tiangKe:mixes.tiangKe,pileCycle:mixes.pileCycle,defaultTonPerRetase:mixes.defaultTonPerRetase,status:mixes.status,replacesMixId:mixes.replacesMixId,note:mixes.note,createdAt:mixes.createdAt,updatedAt:mixes.updatedAt};
      const [items,totalRows]=await Promise.all([db.select(selection).from(mixes).innerJoin(piles,eq(piles.id,mixes.pileId)).leftJoin(plants,eq(plants.id,mixes.plantId)).where(where).orderBy(desc(mixes.operationDate),desc(mixes.createdAt)).limit(filter.limit).offset(filter.offset),db.select({value:count()}).from(mixes).where(where)]);
      return {items:items.map((x)=>({...x,defaultTonPerRetase:Number(x.defaultTonPerRetase)})),total:Number(totalRows[0]?.value??0)};
    },
    async getMixByCode(mixCode){ const [r]=await db.select({id:mixes.id}).from(mixes).where(and(sql`lower(${mixes.mixCode})=lower(${mixCode})`,eq(mixes.status,'ACTIVE'))).limit(1);return r?getMixInternal(r.id):null; },
    async hasConfirmedRetaseAllocation(sampleId,operationDate){const rows=await db.execute(sql`SELECT 1 FROM qc_retase_allocations WHERE sample_id=${sampleId}::uuid AND operation_date=${operationDate}::date AND mapping_status='CONFIRMED' AND review_required=false AND mix_id IS NULL AND approved_retase>0 LIMIT 1`);return (rows as unknown as Array<unknown>).length>0;},
    async saveMix(input){ const mixId=await db.transaction(async(tx)=>{await lockClayColumns(tx,input);return insertMix(tx,input);}); const mix=await getMixInternal(mixId);if(!mix)throw new Error('Mix gagal direload.');return mix; },
    async replaceMix(existingMixId,input,reason,actorUserId,actorRoleSnapshot,requestId){
      const mixId=await db.transaction(async(tx)=>{
        const locked=await tx.execute(sql`SELECT id,mix_code,status FROM mixes WHERE id=${existingMixId} FOR UPDATE`); const old=(locked as unknown as Array<Record<string,unknown>>)[0];
        if(!old||old.status!=='ACTIVE')throw new Error('Mix aktif yang akan diganti tidak ditemukan.');
        await lockClayColumns(tx,input,existingMixId);
        await releaseRetaseConsumptionForMix(tx,existingMixId,reason,actorUserId);
        await tx.update(mixes).set({status:'REPLACED',updatedBy:actorUserId,updatedAt:new Date()}).where(eq(mixes.id,existingMixId));
        const id=await insertMix(tx,{...input,replacesMixId:existingMixId});
        await tx.insert(auditLogs).values({actorUserId,actorRoleSnapshot,action:'REPLACE',entityType:'MIX',entityId:existingMixId,beforeJson:old,afterJson:{replacementMixId:id,mixCode:input.mixCode},reason,requestId});
        return id;
      });
      const mix=await getMixInternal(mixId);if(!mix)throw new Error('Replacement mix gagal direload.');return mix;
    },
    async reviseMixItemChemistry(mixItemId,chemistry,reason,actorUserId,actorRoleSnapshot,requestId){
      const parentId=await db.transaction(async(tx)=>{
        const [item]=await tx.select({id:mixItems.id,mixId:mixItems.mixId,chemistry:mixItems.chemistrySnapshot,status:mixes.status}).from(mixItems).innerJoin(mixes,eq(mixes.id,mixItems.mixId)).where(eq(mixItems.id,mixItemId)).limit(1);
        if(!item||item.status!=='ACTIVE')throw new Error('Mix item aktif tidak ditemukan.');
        const before=item.chemistry as Chemistry;if(chemistryEquals(before,chemistry))return item.mixId;
        const [maxRow]=await tx.select({maxNo:sql<number>`coalesce(max(${mixItemChemistryRevisions.revisionNo}),0)`}).from(mixItemChemistryRevisions).where(eq(mixItemChemistryRevisions.mixItemId,mixItemId));
        const revisionNo=Number(maxRow?.maxNo??0)+1;
        await tx.update(mixItems).set({chemistrySnapshot:chemistry,updatedAt:new Date()}).where(eq(mixItems.id,mixItemId));
        await tx.insert(mixItemChemistryRevisions).values({mixItemId,revisionNo,beforeSnapshot:before,afterSnapshot:chemistry,reason,changedBy:actorUserId});
        await tx.insert(auditLogs).values({actorUserId,actorRoleSnapshot,action:'CHEMISTRY_REVISION',entityType:'MIX_ITEM',entityId:mixItemId,beforeJson:before,afterJson:chemistry,reason,requestId});
        return item.mixId;
      });
      return getMixInternal(parentId);
    },
    async listMixItemRevisions(mixItemId){
      const rows=await db.select({revisionNo:mixItemChemistryRevisions.revisionNo,before:mixItemChemistryRevisions.beforeSnapshot,after:mixItemChemistryRevisions.afterSnapshot,reason:mixItemChemistryRevisions.reason,changedBy:mixItemChemistryRevisions.changedBy,changedByName:users.displayName,changedAt:mixItemChemistryRevisions.changedAt}).from(mixItemChemistryRevisions).innerJoin(users,eq(users.id,mixItemChemistryRevisions.changedBy)).where(eq(mixItemChemistryRevisions.mixItemId,mixItemId)).orderBy(asc(mixItemChemistryRevisions.revisionNo));
      return rows.map(r=>({...r,before:r.before as Chemistry,after:r.after as Chemistry}));
    },
    async listMixSummaries(filter){
      const conditions:SQL[]=[];
      if(filter.materialKind)conditions.push(sql`material_kind=${filter.materialKind}`); if(filter.dateFrom)conditions.push(sql`operation_date>=${filter.dateFrom}`); if(filter.dateTo)conditions.push(sql`operation_date<=${filter.dateTo}`); if(filter.plantId)conditions.push(sql`plant_id=${filter.plantId}::uuid`); if(filter.pileId)conditions.push(sql`pile_id=${filter.pileId}::uuid`);
      const where=conditions.length?sql`WHERE ${sql.join(conditions,sql` AND `)}`:sql``;
      const rows=await db.execute(sql`SELECT * FROM v_mix_summary ${where} ORDER BY operation_date,mix_code`);
      return (rows as unknown as Array<Record<string,unknown>>).map((r)=>({
        mixId:String(r.mix_id),mixCode:String(r.mix_code),materialKind:r.material_kind as MaterialKind,operationDate:String(r.operation_date),plantId:r.plant_id?String(r.plant_id):null,plantCode:r.plant_code?String(r.plant_code):null,plantName:r.plant_name?String(r.plant_name):null,
        pileId:String(r.pile_id),pileCode:String(r.pile_code),pileName:String(r.pile_name),className:r.class_name_snapshot?String(r.class_name_snapshot):null,shiftCode:String(r.shift_code),locationRef:String(r.location_ref),pileCycle:Number(r.pile_cycle),totalTon:nn(r.total_ton),
        chemistry:{sio2:n(r.sio2),al2o3:n(r.al2o3),fe2o3:n(r.fe2o3),cao:n(r.cao),mgo:n(r.mgo),k2o:n(r.k2o),na2o:n(r.na2o),so3:n(r.so3),h2o:n(r.h2o)},quality:{lsf:n(r.lsf),sm:n(r.sm),am:n(r.am),naeq:n(r.naeq),r2o3:n(r.r2o3)},notes:r.notes?String(r.notes):null,createdAt:new Date(String(r.created_at)),
      }));
    },
    async appendAudit(input){ await db.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot??null,action:input.action,entityType:input.entityType,entityId:input.entityId,beforeJson:input.beforeJson,afterJson:input.afterJson,reason:input.reason??null,requestId:input.requestId}); },
  };
}
