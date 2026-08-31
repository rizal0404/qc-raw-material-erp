import type { CreateStockpileLayerRequest, SaveReclaimerPositionRequest, StockpileLotStatusFilter, UpdateStockpileLayerRequest, UpdateStockpileLotRequest } from '@qc/contracts';
import { aggregateStockpileMixes, stockpileQualityStatus, validateStockpileGeometry } from '@qc/domain';
import type { AuthPrincipal, MasterRepository, QcRepository, StockpileLayerRecord, StockpileMapRepository, StockpileMixSummaryRecord } from '@qc/domain';
import { AppError, conflict, forbidden, notFound } from '../../lib/errors';

function assertQc(principal:AuthPrincipal){if(!['QC_ANALYST','SUPERVISOR_ADMIN'].includes(principal.role))throw forbidden();}
function mapRepositoryError(error:unknown):never{
  const message=error instanceof Error?error.message:String(error);
  if(message.includes('STOCKPILE_LAYER_COLLISION'))throw conflict('STOCKPILE_LAYER_COLLISION','Posisi dan level layer bertumpuk dengan layer aktif lain.');
  if(message.includes('STOCKPILE_VERSION_CONFLICT'))throw conflict('STOCKPILE_VERSION_CONFLICT','Layer telah diubah user lain. Muat ulang peta sebelum menyimpan.');
  if(message.includes('RECLAIMER_POSITION_CONFLICT'))throw conflict('RECLAIMER_POSITION_CONFLICT','Posisi REC telah diperbarui user lain. Muat ulang peta sebelum menyimpan.');
  if(message.includes('STOCKPILE_LOT_RECLAIMED'))throw conflict('STOCKPILE_LOT_RECLAIMED','Lot sudah direclaim dan tidak dapat menerima layer aktif.');
  if(message.includes('STOCKPILE_LOT_CONFLICT'))throw conflict('STOCKPILE_LOT_CONFLICT','Nomor lot dan pile cycle sudah digunakan logical pile lain.');
  if(message.includes('STOCKPILE_LOT_NOT_FOUND')||message.includes('STOCKPILE_LAYER_NOT_FOUND'))throw notFound('Lot atau layer Peta Mutu tidak ditemukan.');
  const databaseError=error as {code?:string;constraint_name?:string;constraint?:string};
  if(databaseError.code==='23505'){
    const constraint=databaseError.constraint_name??databaseError.constraint;
    if(constraint==='stockpile_lots_business_uq')throw conflict('STOCKPILE_LOT_NUMBER_CONFLICT','Nomor lot dan pile cycle sudah digunakan lot lain pada gudang ini.');
    if(constraint==='stockpile_layer_mixes_mix_uq'||constraint==='stockpile_layer_mixes_layer_mix_uq')throw conflict('STOCKPILE_MIX_ALREADY_PLACED','Satu atau lebih Mix sudah ditempatkan pada layer lain.');
    throw conflict('STOCKPILE_UNIQUE_CONFLICT','Data Peta Mutu bertabrakan dengan data yang sudah ada.');
  }
  throw error;
}
function checkedGeometry(...args:Parameters<typeof validateStockpileGeometry>){
  try{return validateStockpileGeometry(...args);}catch(error){throw new AppError(400,'STOCKPILE_GEOMETRY_INVALID',error instanceof Error?error.message:'Geometri layer tidak valid.');}
}
const iso=(date:Date)=>date.toISOString();
function businessDate(date=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Makassar',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  const part=(type:string)=>parts.find(item=>item.type===type)?.value??'';
  return`${part('year')}-${part('month')}-${part('day')}`;
}
const endOfBusinessDate=(value:string)=>new Date(`${value}T23:59:59.999+08:00`);

export function createStockpileMapService(repository:StockpileMapRepository,masterRepository:MasterRepository,qcRepository:QcRepository){
  async function layoutOrThrow(id:string){const layout=await repository.findLayout(id);if(!layout||!layout.active)throw notFound('Layout gudang tidak ditemukan atau nonaktif.');return layout;}
  async function validateMixContext(layout:Awaited<ReturnType<typeof layoutOrThrow>>,mixes:StockpileMixSummaryRecord[],lot:{logicalPileId:string;pileCycle:number}){
    if(!mixes.length)throw new AppError(400,'STOCKPILE_MIX_REQUIRED','Minimum satu Mix wajib dipilih.');
    const uniqueIds=new Set(mixes.map((mix)=>mix.mixId));if(uniqueIds.size!==mixes.length)throw new AppError(400,'STOCKPILE_MIX_DUPLICATE','Mix tidak boleh duplikat.');
    if(mixes.some((mix)=>mix.materialKind!==layout.materialKind||mix.plantId!==layout.plantId))throw new AppError(400,'STOCKPILE_MIX_LAYOUT_MISMATCH','Material atau plant Mix tidak sesuai layout gudang.');
    if(mixes.some((mix)=>mix.pileId!==lot.logicalPileId||mix.pileCycle!==lot.pileCycle))throw new AppError(400,'STOCKPILE_MIX_LOT_MISMATCH','Semua Mix pada layer harus berasal dari logical pile dan pile cycle lot yang sama.');
    const pile=await masterRepository.findPileById(lot.logicalPileId);if(!pile||pile.materialKind!==layout.materialKind||pile.plantId!==layout.plantId)throw new AppError(400,'STOCKPILE_PILE_LAYOUT_MISMATCH','Logical pile tidak sesuai layout gudang.');
  }
  async function layerDto(layer:StockpileLayerRecord,mixes:StockpileMixSummaryRecord[],className:string|null,rules:Awaited<ReturnType<QcRepository['getQafRules']>>){const aggregate=aggregateStockpileMixes(mixes);return{...layer,mixes:mixes.map((mix)=>({...mix})),totalTon:aggregate.totalTon,chemistry:aggregate.chemistry,quality:aggregate.quality,qualityStatus:stockpileQualityStatus(mixes[0]?.materialKind??'LS',className,aggregate,rules),createdAt:iso(layer.createdAt),updatedAt:iso(layer.updatedAt)};}

  return{
    async layouts(principal:AuthPrincipal){assertQc(principal);return(await repository.listLayouts()).map((layout)=>({...layout,createdAt:undefined,updatedAt:undefined}));},
    async map(principal:AuthPrincipal,input:{layoutId:string;lotStatus:StockpileLotStatusFilter;asOf?:string|undefined}){
      assertQc(principal);const today=businessDate();const selectedDate=input.asOf??today;if(selectedDate>today)throw new AppError(400,'STOCKPILE_HISTORY_FUTURE_DATE','Tanggal Peta Mutu tidak boleh melewati hari ini.');const isHistorical=selectedDate<today;const historyCutoff=isHistorical?endOfBusinessDate(selectedDate):undefined;const layout=await layoutOrThrow(input.layoutId);
      const[zones,lots,layers,reclaimer,activeLots,reclaimedLots,unplacedMixes,rules]=await Promise.all([repository.listZones(layout.id),repository.listLots(layout.id,input.lotStatus,historyCutoff),repository.listLayers(layout.id,input.lotStatus,historyCutoff),repository.latestReclaimerPosition(layout.id,historyCutoff),repository.countLots(layout.id,'ACTIVE',historyCutoff),repository.countLots(layout.id,'RECLAIMED',historyCutoff),repository.countUnplacedMixes(layout.id,historyCutoff),qcRepository.getQafRules(layout.plantId)]);
      const mixRows=await repository.listLayerMixes(layers.map((layer)=>layer.id),historyCutoff);const mixesByLayer=new Map<string,StockpileMixSummaryRecord[]>();for(const mix of mixRows){if(!mix.layerId)continue;const bucket=mixesByLayer.get(mix.layerId)??[];bucket.push(mix);mixesByLayer.set(mix.layerId,bucket);}
      const lotLayers=new Map<string,StockpileLayerRecord[]>();for(const layer of layers){const bucket=lotLayers.get(layer.lotId)??[];bucket.push(layer);lotLayers.set(layer.lotId,bucket);}
      const layerDtos=await Promise.all(layers.map((layer)=>{const lot=lots.find((item)=>item.id===layer.lotId);return layerDto(layer,mixesByLayer.get(layer.id)??[],lot?.className??null,rules);}));
      const lotDtos=lots.map((lot)=>{const lotMixMap=new Map<string,StockpileMixSummaryRecord>();for(const layer of lotLayers.get(lot.id)??[])for(const mix of mixesByLayer.get(layer.id)??[])lotMixMap.set(mix.mixId,mix);const lotMixes=[...lotMixMap.values()];const aggregate=aggregateStockpileMixes(lotMixes);return{...lot,totalTon:aggregate.totalTon,chemistry:aggregate.chemistry,quality:aggregate.quality,qualityStatus:stockpileQualityStatus(layout.materialKind,lot.className,aggregate,rules),mixCount:lotMixes.length,layerCount:lotLayers.get(lot.id)?.length??0,reclaimedAt:lot.reclaimedAt?iso(lot.reclaimedAt):null,updatedAt:iso(lot.updatedAt),createdAt:undefined};});
      return{asOf:selectedDate,isHistorical,geometryEditing:true,layout:{...layout,createdAt:undefined,updatedAt:undefined},zones,lots:lotDtos,layers:layerDtos,reclaimer:reclaimer?{eventId:reclaimer.id,position:reclaimer.position,effectiveAt:iso(reclaimer.effectiveAt),createdByName:reclaimer.createdByName}:null,counts:{activeLots,reclaimedLots,unplacedMixes}};
    },
    async availableMixes(principal:AuthPrincipal,layoutId:string,onlyUnplaced:boolean){assertQc(principal);await layoutOrThrow(layoutId);return repository.listAvailableMixes(layoutId,onlyUnplaced);},
    async createLayer(principal:AuthPrincipal,input:CreateStockpileLayerRequest,requestId?:string){
      assertQc(principal);const layout=await layoutOrThrow(input.layoutId);const rectangle=checkedGeometry(layout,input);const mixes=await repository.findMixes(input.mixIds);if(mixes.length!==input.mixIds.length)throw notFound('Satu atau lebih Mix aktif tidak ditemukan.');
      const existingLot=input.lotId?await repository.findLot(input.lotId):null;if(input.lotId&&!existingLot)throw notFound('Lot Peta Mutu tidak ditemukan.');if(existingLot&&existingLot.layoutId!==layout.id)throw new AppError(400,'STOCKPILE_LOT_LAYOUT_MISMATCH','Lot tidak sesuai layout gudang.');
      const logicalPileId=existingLot?.logicalPileId??input.logicalPileId??mixes[0]!.pileId;const pileCycle=existingLot?.pileCycle??input.pileCycle??mixes[0]!.pileCycle;
      await validateMixContext(layout,mixes,{logicalPileId,pileCycle});
      const lotNoMode=existingLot?.lotNoMode??input.lotNoMode;const lotNo=existingLot?.lotNo??(lotNoMode==='PILE_CYCLE'?String(pileCycle):input.lotNo?.trim());if(!lotNo)throw new AppError(400,'STOCKPILE_LOT_NO_REQUIRED','Nomor lot manual wajib.');
      try{const created=await repository.createLayer({layoutId:layout.id,lot:{...(existingLot?{id:existingLot.id}:{}),logicalPileId,lotNo,lotNoMode,pileCycle},layer:{label:input.label?.trim()||null,...rectangle},mixIds:input.mixIds,actorUserId:principal.userId});await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'CREATE',entityType:'STOCKPILE_LAYER',entityId:created.layerId,afterJson:{layoutId:layout.id,lotId:created.lotId,lotNo,mixIds:input.mixIds,...rectangle},requestId});return created;}catch(error){mapRepositoryError(error);}
    },
    async updateLayer(principal:AuthPrincipal,id:string,input:UpdateStockpileLayerRequest,requestId?:string){
      assertQc(principal);const current=await repository.findLayer(id);if(!current)throw notFound('Layer Peta Mutu tidak ditemukan.');const layout=await layoutOrThrow(current.layoutId);const lot=await repository.findLot(current.lotId);if(!lot)throw notFound('Lot Peta Mutu tidak ditemukan.');const currentMixes=await repository.listLayerMixes([id]);const mixes=input.mixIds?await repository.findMixes(input.mixIds):currentMixes;if(input.mixIds&&mixes.length!==input.mixIds.length)throw notFound('Satu atau lebih Mix aktif tidak ditemukan.');if(current.version!==input.expectedVersion)throw conflict('STOCKPILE_VERSION_CONFLICT','Layer telah diubah user lain. Muat ulang peta sebelum menyimpan.');await validateMixContext(layout,mixes,{logicalPileId:lot.logicalPileId,pileCycle:lot.pileCycle});
      const rectangle=checkedGeometry(layout,{startPosition:input.startPosition??current.startPosition,endPosition:input.endPosition??current.endPosition,bottomLevel:input.bottomLevel??current.bottomLevel,topLevel:input.topLevel??current.topLevel,startDepth:input.startDepth??current.startDepth,endDepth:input.endDepth??current.endDepth});const label=input.label===undefined?current.label:input.label?.trim()||null;
      try{await repository.updateLayer({id,layoutId:layout.id,expectedVersion:input.expectedVersion,label,...rectangle,mixIds:mixes.map((mix)=>mix.mixId),actorUserId:principal.userId});await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'UPDATE',entityType:'STOCKPILE_LAYER',entityId:id,beforeJson:{version:current.version,startPosition:current.startPosition,endPosition:current.endPosition,bottomLevel:current.bottomLevel,topLevel:current.topLevel,startDepth:current.startDepth,endDepth:current.endDepth,mixIds:currentMixes.map((mix)=>mix.mixId)},afterJson:{version:input.expectedVersion+1,...rectangle,mixIds:mixes.map((mix)=>mix.mixId)},requestId});return{id};}catch(error){mapRepositoryError(error);}
    },
    async updateLot(principal:AuthPrincipal,id:string,input:UpdateStockpileLotRequest,requestId?:string){assertQc(principal);const current=await repository.findLot(id);if(!current)throw notFound('Lot Peta Mutu tidak ditemukan.');const status=input.status??current.status;const lotNoMode=input.lotNoMode??current.lotNoMode;const lotNo=lotNoMode==='PILE_CYCLE'?String(current.pileCycle):(input.lotNo??current.lotNo).trim();if(!lotNo)throw new AppError(400,'STOCKPILE_LOT_NO_REQUIRED','Nomor lot manual wajib.');try{await repository.updateLot({id,status,lotNoMode,lotNo,actorUserId:principal.userId});await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'UPDATE',entityType:'STOCKPILE_LOT',entityId:id,beforeJson:{status:current.status,lotNo:current.lotNo,lotNoMode:current.lotNoMode},afterJson:{status,lotNo,lotNoMode},requestId});return{id};}catch(error){mapRepositoryError(error);}},
    async saveReclaimer(principal:AuthPrincipal,input:SaveReclaimerPositionRequest,requestId?:string){assertQc(principal);const layout=await layoutOrThrow(input.layoutId);if(input.position<0||input.position>layout.axisLength)throw new AppError(400,'RECLAIMER_POSITION_RANGE',`Posisi REC harus berada pada sumbu 0-${layout.axisLength}.`);try{const event=await repository.appendReclaimerPosition({layoutId:layout.id,position:input.position,effectiveAt:input.effectiveAt?new Date(input.effectiveAt):new Date(),expectedEventId:input.expectedEventId??null,reason:input.reason?.trim()||null,actorUserId:principal.userId});await repository.appendAudit({actorUserId:principal.userId,actorRoleSnapshot:principal.role,action:'POSITION_UPDATE',entityType:'RECLAIMER',entityId:layout.id,afterJson:{eventId:event.id,position:event.position,effectiveAt:iso(event.effectiveAt)},reason:input.reason??null,requestId});return{eventId:event.id,position:event.position,effectiveAt:iso(event.effectiveAt),createdByName:event.createdByName};}catch(error){mapRepositoryError(error);}},
  };
}
export type StockpileMapService=ReturnType<typeof createStockpileMapService>;
