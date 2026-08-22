import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Chemistry, MaterialKind, StockpileLotStatus, StockpileLotStatusFilter } from '@qc/contracts';
import { calculateQuality } from '@qc/domain';
import type { ReclaimerPositionRecord, StockpileLayerRecord, StockpileLotRecord, StockpileMapRepository, StockpileMixSummaryRecord, WarehouseLayoutRecord, WarehouseZoneRecord } from '@qc/domain';
import type * as Schema from '../schema/index';
import { auditLogs, piles, plants, reclaimerPositionEvents, stockpileLayerMixes, stockpileLayers, stockpileLayerVersions, stockpileLots, stockpileLotVersions, users, warehouseLayouts, warehouseZones } from '../schema/index';

const CHEM_KEYS=['sio2','al2o3','fe2o3','cao','mgo','k2o','na2o','so3','h2o'] as const;
function n(value:unknown):number|null{if(value===null||value===undefined||value==='')return null;const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;}
function nn(value:unknown):number{const parsed=Number(value);return Number.isFinite(parsed)?parsed:0;}
function chemistry(row:Record<string,unknown>):Chemistry{return Object.fromEntries(CHEM_KEYS.map((key)=>[key,n(row[key])])) as Chemistry;}
function mixSummary(row:Record<string,unknown>,layerId?:string):StockpileMixSummaryRecord{
  const mixChemistry=chemistry(row);
  return{
    ...(layerId?{layerId}:{}),mixId:String(row.mix_id),mixCode:String(row.mix_code),materialKind:row.material_kind as MaterialKind,operationDate:String(row.operation_date),
    plantId:row.plant_id?String(row.plant_id):null,pileId:String(row.pile_id),pileCode:String(row.pile_code),pileName:String(row.pile_name),className:row.class_name_snapshot?String(row.class_name_snapshot):null,
    pileCycle:Number(row.pile_cycle),batchNo:row.batch_no===null||row.batch_no===undefined?null:Number(row.batch_no),tiangKe:row.tiang_ke?String(row.tiang_ke):null,
    totalTon:nn(row.total_ton),chemistry:mixChemistry,quality:calculateQuality(mixChemistry),
  };
}
function layoutRecord(row:any):WarehouseLayoutRecord{return{id:row.id,code:row.code,name:row.name,materialKind:row.materialKind,plantId:row.plantId,plantCode:row.plantCode,plantName:row.plantName,axisLength:Number(row.axisLength),maxLevel:Number(row.maxLevel),postMarks:Array.isArray(row.postMarks)?row.postMarks.map((mark:any)=>({position:Number(mark.position),label:String(mark.label)})):[],hopperSide:row.hopperSide as 'START'|'END',active:row.active,createdAt:row.createdAt,updatedAt:row.updatedAt};}
function zoneRecord(row:typeof warehouseZones.$inferSelect):WarehouseZoneRecord{return{id:row.id,layoutId:row.layoutId,code:row.code,label:row.label,kind:row.kind,startPosition:Number(row.startPosition),endPosition:Number(row.endPosition),bottomLevel:Number(row.bottomLevel),topLevel:Number(row.topLevel),displayOrder:row.displayOrder};}
function lotRecord(row:any):StockpileLotRecord{return{id:row.id,layoutId:row.layoutId,logicalPileId:row.logicalPileId,logicalPileCode:row.logicalPileCode,logicalPileName:row.logicalPileName,className:row.className,lotNo:row.lotNo,lotNoMode:row.lotNoMode,pileCycle:row.pileCycle,status:row.status,reclaimedAt:row.reclaimedAt,createdAt:row.createdAt,updatedAt:row.updatedAt};}
function layerRecord(row:any):StockpileLayerRecord{return{id:row.id,lotId:row.lotId,layoutId:row.layoutId,lotNo:row.lotNo,lotStatus:row.lotStatus,label:row.label,startPosition:Number(row.startPosition),endPosition:Number(row.endPosition),bottomLevel:Number(row.bottomLevel),topLevel:Number(row.topLevel),version:row.version,createdAt:row.createdAt,updatedAt:row.updatedAt};}

export function createStockpileMapRepository(db:PostgresJsDatabase<typeof Schema>):StockpileMapRepository{
  const layoutSelection={id:warehouseLayouts.id,code:warehouseLayouts.code,name:warehouseLayouts.name,materialKind:warehouseLayouts.materialKind,plantId:warehouseLayouts.plantId,plantCode:plants.code,plantName:plants.name,axisLength:warehouseLayouts.axisLength,maxLevel:warehouseLayouts.maxLevel,postMarks:warehouseLayouts.postMarks,hopperSide:warehouseLayouts.hopperSide,active:warehouseLayouts.active,createdAt:warehouseLayouts.createdAt,updatedAt:warehouseLayouts.updatedAt};
  const lotSelection={id:stockpileLots.id,layoutId:stockpileLots.layoutId,logicalPileId:stockpileLots.logicalPileId,logicalPileCode:piles.code,logicalPileName:piles.name,className:piles.className,lotNo:stockpileLots.lotNo,lotNoMode:stockpileLots.lotNoMode,pileCycle:stockpileLots.pileCycle,status:stockpileLots.status,reclaimedAt:stockpileLots.reclaimedAt,createdAt:stockpileLots.createdAt,updatedAt:stockpileLots.updatedAt};
  const layerSelection={id:stockpileLayers.id,lotId:stockpileLayers.lotId,layoutId:stockpileLots.layoutId,lotNo:stockpileLots.lotNo,lotStatus:stockpileLots.status,label:stockpileLayers.label,startPosition:stockpileLayers.startPosition,endPosition:stockpileLayers.endPosition,bottomLevel:stockpileLayers.bottomLevel,topLevel:stockpileLayers.topLevel,version:stockpileLayers.version,createdAt:stockpileLayers.createdAt,updatedAt:stockpileLayers.updatedAt};

  async function assertNoCollision(tx:any,layoutId:string,rectangle:{startPosition:number;endPosition:number;bottomLevel:number;topLevel:number},excludeLayerId?:string){
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stockpile-map:'+layoutId}))`);
    const rows=await tx.execute(sql`
      SELECT sl.id FROM stockpile_layers sl JOIN stockpile_lots lot ON lot.id=sl.lot_id
      WHERE lot.layout_id=${layoutId}::uuid AND lot.status='ACTIVE'
        ${excludeLayerId?sql`AND sl.id<>${excludeLayerId}::uuid`:sql``}
        AND greatest(sl.start_position,${rectangle.startPosition})<least(sl.end_position,${rectangle.endPosition})
        AND greatest(sl.bottom_level,${rectangle.bottomLevel})<least(sl.top_level,${rectangle.topLevel})
      LIMIT 1 FOR UPDATE OF sl`);
    if((rows as unknown as unknown[]).length)throw new Error('STOCKPILE_LAYER_COLLISION');
  }

  async function mixesQuery(ids:string[],layerIds?:string[]):Promise<StockpileMixSummaryRecord[]>{
    if(!ids.length&&!layerIds?.length)return[];
    const idFilter=ids.length?sql`v.mix_id IN (${sql.join(ids.map((id)=>sql`${id}::uuid`),sql`,`)})`:sql``;
    const layerFilter=layerIds?.length?sql`slm.layer_id IN (${sql.join(layerIds.map((id)=>sql`${id}::uuid`),sql`,`)})`:sql``;
    const join=layerIds?.length?sql`JOIN stockpile_layer_mixes slm ON slm.mix_id=v.mix_id`:sql`LEFT JOIN stockpile_layer_mixes slm ON false`;
    const where=ids.length&&layerIds?.length?sql`${idFilter} AND ${layerFilter}`:ids.length?idFilter:layerFilter;
    const rows=await db.execute(sql`SELECT v.*,m.batch_no,m.tiang_ke,slm.layer_id FROM v_mix_summary v JOIN mixes m ON m.id=v.mix_id ${join} WHERE ${where} ORDER BY v.operation_date,v.mix_code`);
    return(rows as unknown as Array<Record<string,unknown>>).map((row)=>mixSummary(row,row.layer_id?String(row.layer_id):undefined));
  }

  async function historicalLots(layoutId:string,status:StockpileLotStatusFilter,asOf:Date):Promise<StockpileLotRecord[]>{
    const cutoff=asOf.toISOString();
    const rows=await db.execute(sql`
      WITH latest_lot AS (
        SELECT DISTINCT ON (version.lot_id) version.*
        FROM stockpile_lot_versions version
        WHERE version.layout_id=${layoutId}::uuid AND version.effective_at<=${cutoff}
        ORDER BY version.lot_id,version.effective_at DESC,version.id DESC
      )
      SELECT version.lot_id AS "id",version.layout_id AS "layoutId",version.logical_pile_id AS "logicalPileId",
        pile.code AS "logicalPileCode",pile.name AS "logicalPileName",pile.class_name AS "className",
        version.lot_no AS "lotNo",version.lot_no_mode AS "lotNoMode",version.pile_cycle AS "pileCycle",
        version.status,version.reclaimed_at AS "reclaimedAt",lot.created_at AS "createdAt",version.effective_at AS "updatedAt"
      FROM latest_lot version
      JOIN stockpile_lots lot ON lot.id=version.lot_id
      JOIN piles pile ON pile.id=version.logical_pile_id
      WHERE ${status==='ALL'?sql`true`:sql`version.status=${status}`}
      ORDER BY version.lot_no,version.effective_at DESC`);
    return(rows as unknown as Array<Record<string,unknown>>).map(lotRecord);
  }

  async function historicalLayers(layoutId:string,status:StockpileLotStatusFilter,asOf:Date):Promise<StockpileLayerRecord[]>{
    const cutoff=asOf.toISOString();
    const rows=await db.execute(sql`
      WITH latest_lot AS (
        SELECT DISTINCT ON (version.lot_id) version.*
        FROM stockpile_lot_versions version
        WHERE version.layout_id=${layoutId}::uuid AND version.effective_at<=${cutoff}
        ORDER BY version.lot_id,version.effective_at DESC,version.id DESC
      ), latest_layer AS (
        SELECT DISTINCT ON (version.layer_id) version.*
        FROM stockpile_layer_versions version
        WHERE version.effective_at<=${cutoff}
        ORDER BY version.layer_id,version.effective_at DESC,version.id DESC
      )
      SELECT version.layer_id AS "id",version.lot_id AS "lotId",lot.layout_id AS "layoutId",
        lot.lot_no AS "lotNo",lot.status AS "lotStatus",version.label,
        version.start_position AS "startPosition",version.end_position AS "endPosition",
        version.bottom_level AS "bottomLevel",version.top_level AS "topLevel",version.version,
        layer.created_at AS "createdAt",version.effective_at AS "updatedAt"
      FROM latest_layer version
      JOIN latest_lot lot ON lot.lot_id=version.lot_id
      JOIN stockpile_layers layer ON layer.id=version.layer_id
      WHERE ${status==='ALL'?sql`true`:sql`lot.status=${status}`}
      ORDER BY version.bottom_level,version.start_position`);
    return(rows as unknown as Array<Record<string,unknown>>).map(layerRecord);
  }

  async function historicalLayerMixes(layerIds:string[],asOf:Date):Promise<StockpileMixSummaryRecord[]>{
    if(!layerIds.length)return[];
    const cutoff=asOf.toISOString();
    const rows=await db.execute(sql`
      WITH latest_layer AS (
        SELECT DISTINCT ON (version.layer_id) version.*
        FROM stockpile_layer_versions version
        WHERE version.layer_id IN (${sql.join(layerIds.map((id)=>sql`${id}::uuid`),sql`,`)})
          AND version.effective_at<=${cutoff}
        ORDER BY version.layer_id,version.effective_at DESC,version.id DESC
      )
      SELECT summary.*,mix.batch_no,mix.tiang_ke,version.layer_id
      FROM latest_layer version
      CROSS JOIN LATERAL jsonb_array_elements_text(version.mix_ids) WITH ORDINALITY AS selected(mix_id,display_order)
      JOIN v_mix_summary summary ON summary.mix_id=selected.mix_id::uuid
      JOIN mixes mix ON mix.id=summary.mix_id
      ORDER BY version.layer_id,selected.display_order`);
    return(rows as unknown as Array<Record<string,unknown>>).map((row)=>mixSummary(row,String(row.layer_id)));
  }

  return{
    async listLayouts(){const rows=await db.select(layoutSelection).from(warehouseLayouts).innerJoin(plants,eq(plants.id,warehouseLayouts.plantId)).where(eq(warehouseLayouts.active,true)).orderBy(asc(warehouseLayouts.materialKind),asc(plants.code),asc(warehouseLayouts.code));return rows.map(layoutRecord);},
    async findLayout(id){const[row]=await db.select(layoutSelection).from(warehouseLayouts).innerJoin(plants,eq(plants.id,warehouseLayouts.plantId)).where(eq(warehouseLayouts.id,id)).limit(1);return row?layoutRecord(row):null;},
    async listZones(layoutId){return(await db.select().from(warehouseZones).where(eq(warehouseZones.layoutId,layoutId)).orderBy(asc(warehouseZones.displayOrder),asc(warehouseZones.code))).map(zoneRecord);},
    async listLots(layoutId,status,asOf){if(asOf)return historicalLots(layoutId,status,asOf);const conditions=[eq(stockpileLots.layoutId,layoutId)];if(status!=='ALL')conditions.push(eq(stockpileLots.status,status));const rows=await db.select(lotSelection).from(stockpileLots).innerJoin(piles,eq(piles.id,stockpileLots.logicalPileId)).where(and(...conditions)).orderBy(asc(stockpileLots.lotNo),desc(stockpileLots.updatedAt));return rows.map(lotRecord);},
    async findLot(id){const[row]=await db.select(lotSelection).from(stockpileLots).innerJoin(piles,eq(piles.id,stockpileLots.logicalPileId)).where(eq(stockpileLots.id,id)).limit(1);return row?lotRecord(row):null;},
    async listLayers(layoutId,status,asOf){if(asOf)return historicalLayers(layoutId,status,asOf);const conditions=[eq(stockpileLots.layoutId,layoutId)];if(status!=='ALL')conditions.push(eq(stockpileLots.status,status));const rows=await db.select(layerSelection).from(stockpileLayers).innerJoin(stockpileLots,eq(stockpileLots.id,stockpileLayers.lotId)).where(and(...conditions)).orderBy(asc(stockpileLayers.bottomLevel),asc(stockpileLayers.startPosition));return rows.map(layerRecord);},
    async findLayer(id){const[row]=await db.select(layerSelection).from(stockpileLayers).innerJoin(stockpileLots,eq(stockpileLots.id,stockpileLayers.lotId)).where(eq(stockpileLayers.id,id)).limit(1);return row?layerRecord(row):null;},
    async listLayerMixes(layerIds,asOf){return asOf?historicalLayerMixes(layerIds,asOf):mixesQuery([],layerIds);},
    async listAvailableMixes(layoutId,onlyUnplaced){const rows=await db.execute(sql`
      SELECT v.*,m.batch_no,m.tiang_ke,NULL::uuid AS layer_id
      FROM v_mix_summary v JOIN mixes m ON m.id=v.mix_id JOIN warehouse_layouts wl ON wl.id=${layoutId}::uuid
      WHERE v.material_kind=wl.material_kind AND v.plant_id=wl.plant_id
        ${onlyUnplaced?sql`AND NOT EXISTS(SELECT 1 FROM stockpile_layer_mixes slm WHERE slm.mix_id=v.mix_id)`:sql``}
      ORDER BY v.operation_date DESC,v.mix_code DESC LIMIT 500`);return(rows as unknown as Array<Record<string,unknown>>).map((row)=>mixSummary(row));},
    async findMixes(ids){return mixesQuery(ids);},
    async createLayer(input){return db.transaction(async(tx)=>{
      let lotId=input.lot.id;let createdLot=false;
      if(lotId){const[lot]=await tx.select({id:stockpileLots.id,layoutId:stockpileLots.layoutId,status:stockpileLots.status}).from(stockpileLots).where(eq(stockpileLots.id,lotId)).for('update').limit(1);if(!lot||lot.layoutId!==input.layoutId)throw new Error('STOCKPILE_LOT_NOT_FOUND');if(lot.status!=='ACTIVE')throw new Error('STOCKPILE_LOT_RECLAIMED');}
      else{
        const inserted=await tx.insert(stockpileLots).values({layoutId:input.layoutId,logicalPileId:input.lot.logicalPileId,lotNo:input.lot.lotNo,lotNoMode:input.lot.lotNoMode,pileCycle:input.lot.pileCycle,createdBy:input.actorUserId,updatedBy:input.actorUserId}).onConflictDoNothing({target:[stockpileLots.layoutId,stockpileLots.lotNo,stockpileLots.pileCycle]}).returning({id:stockpileLots.id,logicalPileId:stockpileLots.logicalPileId,status:stockpileLots.status});
        if(inserted[0]){lotId=inserted[0].id;createdLot=true;}else{const[existing]=await tx.select({id:stockpileLots.id,logicalPileId:stockpileLots.logicalPileId,status:stockpileLots.status}).from(stockpileLots).where(and(eq(stockpileLots.layoutId,input.layoutId),eq(stockpileLots.lotNo,input.lot.lotNo),eq(stockpileLots.pileCycle,input.lot.pileCycle))).for('update').limit(1);if(!existing||existing.logicalPileId!==input.lot.logicalPileId)throw new Error('STOCKPILE_LOT_CONFLICT');if(existing.status!=='ACTIVE')throw new Error('STOCKPILE_LOT_RECLAIMED');lotId=existing.id;}
      }
      if(createdLot)await tx.insert(stockpileLotVersions).values({lotId:lotId!,layoutId:input.layoutId,logicalPileId:input.lot.logicalPileId,lotNo:input.lot.lotNo,lotNoMode:input.lot.lotNoMode,pileCycle:input.lot.pileCycle,status:'ACTIVE',reclaimedAt:null,changedBy:input.actorUserId});
      await assertNoCollision(tx,input.layoutId,input.layer);
      const[layer]=await tx.insert(stockpileLayers).values({lotId:lotId!,label:input.layer.label,startPosition:String(input.layer.startPosition),endPosition:String(input.layer.endPosition),bottomLevel:String(input.layer.bottomLevel),topLevel:String(input.layer.topLevel),createdBy:input.actorUserId,updatedBy:input.actorUserId}).returning({id:stockpileLayers.id});
      await tx.insert(stockpileLayerMixes).values(input.mixIds.map((mixId,index)=>({layerId:layer!.id,mixId,displayOrder:index})));
      await tx.insert(stockpileLayerVersions).values({layerId:layer!.id,lotId:lotId!,label:input.layer.label,startPosition:String(input.layer.startPosition),endPosition:String(input.layer.endPosition),bottomLevel:String(input.layer.bottomLevel),topLevel:String(input.layer.topLevel),version:1,mixIds:input.mixIds,changedBy:input.actorUserId});
      return{lotId:lotId!,layerId:layer!.id};
    });},
    async updateLayer(input){await db.transaction(async(tx)=>{
      const[current]=await tx.select({id:stockpileLayers.id,version:stockpileLayers.version,status:stockpileLots.status}).from(stockpileLayers).innerJoin(stockpileLots,eq(stockpileLots.id,stockpileLayers.lotId)).where(eq(stockpileLayers.id,input.id)).for('update').limit(1);
      if(!current)throw new Error('STOCKPILE_LAYER_NOT_FOUND');if(current.version!==input.expectedVersion)throw new Error('STOCKPILE_VERSION_CONFLICT');if(current.status!=='ACTIVE')throw new Error('STOCKPILE_LOT_RECLAIMED');
      await assertNoCollision(tx,input.layoutId,input,input.id);
      await tx.update(stockpileLayers).set({label:input.label,startPosition:String(input.startPosition),endPosition:String(input.endPosition),bottomLevel:String(input.bottomLevel),topLevel:String(input.topLevel),version:input.expectedVersion+1,updatedBy:input.actorUserId,updatedAt:new Date()}).where(eq(stockpileLayers.id,input.id));
      await tx.delete(stockpileLayerMixes).where(eq(stockpileLayerMixes.layerId,input.id));
      await tx.insert(stockpileLayerMixes).values(input.mixIds.map((mixId,index)=>({layerId:input.id,mixId,displayOrder:index})));
      const[layer]=await tx.select({lotId:stockpileLayers.lotId}).from(stockpileLayers).where(eq(stockpileLayers.id,input.id)).limit(1);
      await tx.insert(stockpileLayerVersions).values({layerId:input.id,lotId:layer!.lotId,label:input.label,startPosition:String(input.startPosition),endPosition:String(input.endPosition),bottomLevel:String(input.bottomLevel),topLevel:String(input.topLevel),version:input.expectedVersion+1,mixIds:input.mixIds,changedBy:input.actorUserId});
    });},
    async updateLot(input){await db.transaction(async(tx)=>{
      const[current]=await tx.select({id:stockpileLots.id,layoutId:stockpileLots.layoutId,status:stockpileLots.status}).from(stockpileLots).where(eq(stockpileLots.id,input.id)).for('update').limit(1);if(!current)throw new Error('STOCKPILE_LOT_NOT_FOUND');
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'stockpile-map:'+current.layoutId}))`);
      if(current.status==='RECLAIMED'&&input.status==='ACTIVE'){
        const collisions=await tx.execute(sql`SELECT 1 FROM stockpile_layers own JOIN stockpile_layers other ON other.id<>own.id JOIN stockpile_lots other_lot ON other_lot.id=other.lot_id WHERE own.lot_id=${input.id}::uuid AND other_lot.layout_id=${current.layoutId}::uuid AND other_lot.status='ACTIVE' AND greatest(own.start_position,other.start_position)<least(own.end_position,other.end_position) AND greatest(own.bottom_level,other.bottom_level)<least(own.top_level,other.top_level) LIMIT 1`);if((collisions as unknown as unknown[]).length)throw new Error('STOCKPILE_LAYER_COLLISION');
      }
      await tx.update(stockpileLots).set({status:input.status,lotNo:input.lotNo,lotNoMode:input.lotNoMode,reclaimedAt:input.status==='RECLAIMED'?new Date():null,updatedBy:input.actorUserId,updatedAt:new Date()}).where(eq(stockpileLots.id,input.id));
      const[updated]=await tx.select().from(stockpileLots).where(eq(stockpileLots.id,input.id)).limit(1);
      await tx.insert(stockpileLotVersions).values({lotId:updated!.id,layoutId:updated!.layoutId,logicalPileId:updated!.logicalPileId,lotNo:updated!.lotNo,lotNoMode:updated!.lotNoMode,pileCycle:updated!.pileCycle,status:updated!.status,reclaimedAt:updated!.reclaimedAt,changedBy:input.actorUserId});
    });},
    async latestReclaimerPosition(layoutId,asOf){const conditions=[eq(reclaimerPositionEvents.layoutId,layoutId)];if(asOf)conditions.push(sql`${reclaimerPositionEvents.effectiveAt}<=${asOf.toISOString()}`);const[row]=await db.select({id:reclaimerPositionEvents.id,layoutId:reclaimerPositionEvents.layoutId,position:reclaimerPositionEvents.position,effectiveAt:reclaimerPositionEvents.effectiveAt,createdBy:reclaimerPositionEvents.createdBy,createdByName:users.displayName,createdAt:reclaimerPositionEvents.createdAt}).from(reclaimerPositionEvents).innerJoin(users,eq(users.id,reclaimerPositionEvents.createdBy)).where(and(...conditions)).orderBy(desc(reclaimerPositionEvents.effectiveAt),desc(reclaimerPositionEvents.createdAt)).limit(1);return row?{...row,position:Number(row.position)} as ReclaimerPositionRecord:null;},
    async appendReclaimerPosition(input){const id=await db.transaction(async(tx)=>{await tx.select({id:warehouseLayouts.id}).from(warehouseLayouts).where(eq(warehouseLayouts.id,input.layoutId)).for('update').limit(1);const[current]=await tx.select({id:reclaimerPositionEvents.id}).from(reclaimerPositionEvents).where(eq(reclaimerPositionEvents.layoutId,input.layoutId)).orderBy(desc(reclaimerPositionEvents.effectiveAt),desc(reclaimerPositionEvents.createdAt)).limit(1);if((current?.id??null)!==input.expectedEventId)throw new Error('RECLAIMER_POSITION_CONFLICT');const[row]=await tx.insert(reclaimerPositionEvents).values({layoutId:input.layoutId,position:String(input.position),effectiveAt:input.effectiveAt,reason:input.reason,createdBy:input.actorUserId}).returning({id:reclaimerPositionEvents.id});return row!.id;});const[row]=await db.select({id:reclaimerPositionEvents.id,layoutId:reclaimerPositionEvents.layoutId,position:reclaimerPositionEvents.position,effectiveAt:reclaimerPositionEvents.effectiveAt,createdBy:reclaimerPositionEvents.createdBy,createdByName:users.displayName,createdAt:reclaimerPositionEvents.createdAt}).from(reclaimerPositionEvents).innerJoin(users,eq(users.id,reclaimerPositionEvents.createdBy)).where(eq(reclaimerPositionEvents.id,id));return{...row!,position:Number(row!.position)} as ReclaimerPositionRecord;},
    async countLots(layoutId,status,asOf){if(asOf)return(await historicalLots(layoutId,status,asOf)).length;const[row]=await db.select({value:count()}).from(stockpileLots).where(and(eq(stockpileLots.layoutId,layoutId),eq(stockpileLots.status,status)));return Number(row?.value??0);},
    async countUnplacedMixes(layoutId,asOf){if(asOf){const cutoff=asOf.toISOString();const rows=await db.execute(sql`
      WITH latest_layer AS (
        SELECT DISTINCT ON (version.layer_id) version.*
        FROM stockpile_layer_versions version
        JOIN stockpile_lots lot ON lot.id=version.lot_id
        WHERE lot.layout_id=${layoutId}::uuid AND version.effective_at<=${cutoff}
        ORDER BY version.layer_id,version.effective_at DESC,version.id DESC
      ), placed_mix AS (
        SELECT DISTINCT selected.mix_id::uuid AS mix_id
        FROM latest_layer version
        CROSS JOIN LATERAL jsonb_array_elements_text(version.mix_ids) AS selected(mix_id)
      )
      SELECT count(*)::int AS value
      FROM v_mix_summary summary JOIN warehouse_layouts layout ON layout.id=${layoutId}::uuid
      WHERE summary.material_kind=layout.material_kind AND summary.plant_id=layout.plant_id
        AND summary.operation_date<=(${cutoff}::timestamptz AT TIME ZONE 'Asia/Makassar')::date
        AND NOT EXISTS(SELECT 1 FROM placed_mix WHERE placed_mix.mix_id=summary.mix_id)`);return Number((rows as unknown as Array<Record<string,unknown>>)[0]?.value??0);}
      const rows=await db.execute(sql`SELECT count(*)::int AS value FROM v_mix_summary v JOIN warehouse_layouts wl ON wl.id=${layoutId}::uuid WHERE v.material_kind=wl.material_kind AND v.plant_id=wl.plant_id AND NOT EXISTS(SELECT 1 FROM stockpile_layer_mixes slm WHERE slm.mix_id=v.mix_id)`);return Number((rows as unknown as Array<Record<string,unknown>>)[0]?.value??0);},
    async appendAudit(input){await db.insert(auditLogs).values({actorUserId:input.actorUserId,actorRoleSnapshot:input.actorRoleSnapshot??null,action:input.action,entityType:input.entityType,entityId:input.entityId,beforeJson:input.beforeJson,afterJson:input.afterJson,reason:input.reason??null,requestId:input.requestId});},
  };
}
