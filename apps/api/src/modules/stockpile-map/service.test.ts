import { UpdateStockpileLayerRequestSchema } from '@qc/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal, CreateStockpileLayerRepositoryInput, MasterRepository, QcRepository, StockpileMapRepository, StockpileMixSummaryRecord, WarehouseLayoutRecord } from '@qc/domain';
import { createStockpileMapService } from './service';

const principal:AuthPrincipal={sessionId:'s',userId:'11111111-1111-4111-8111-111111111111',username:'qc',displayName:'QC',role:'QC_ANALYST',vendorId:null,status:'ACTIVE',crusherIds:[],lastLoginAt:null,sessionExpiresAt:new Date(),sessionLastSeenAt:new Date()};
const layout:WarehouseLayoutRecord={id:'22222222-2222-4222-8222-222222222222',code:'LS_4',name:'Gudang Limestone 4',materialKind:'LS',plantId:'33333333-3333-4333-8333-333333333333',plantCode:'TONASA_4',plantName:'Tonasa 4',axisLength:35,maxLevel:3,postMarks:[],hopperSide:'START',active:true,createdAt:new Date(),updatedAt:new Date()};
const mix:StockpileMixSummaryRecord={mixId:'44444444-4444-4444-8444-444444444444',mixCode:'MIX-LS-9',materialKind:'LS',operationDate:'2026-08-21',plantId:layout.plantId,pileId:'55555555-5555-4555-8555-555555555555',pileCode:'LS_4_PILE_TIMUR',pileName:'Pile Timur',className:'Timur',pileCycle:9,batchNo:138,tiangKe:null,totalTon:500,chemistry:{sio2:1,al2o3:1,fe2o3:1,cao:53,mgo:.2,k2o:null,na2o:null,so3:null,h2o:null},quality:{lsf:1200,sm:.5,am:1,naeq:null,r2o3:3}};

function fixtures(){
  let created:CreateStockpileLayerRepositoryInput|undefined;let reclaimerInput:Parameters<StockpileMapRepository['appendReclaimerPosition']>[0]|undefined;let mapCutoff:Date|undefined;
  const repository={
    findLayout:async()=>layout,findMixes:async()=>[mix],findLot:async()=>null,
    listZones:async()=>[],listLots:async(_layoutId:string,_status:string,asOf?:Date)=>{mapCutoff=asOf;return[];},listLayers:async()=>[],latestReclaimerPosition:async()=>null,countLots:async()=>0,countUnplacedMixes:async()=>0,listLayerMixes:async()=>[],
    createLayer:async(input:CreateStockpileLayerRepositoryInput)=>{created=input;return{lotId:'66666666-6666-4666-8666-666666666666',layerId:'77777777-7777-4777-8777-777777777777'};},
    appendAudit:async()=>{},appendReclaimerPosition:async(input:Parameters<StockpileMapRepository['appendReclaimerPosition']>[0])=>{reclaimerInput=input;return{id:'88888888-8888-4888-8888-888888888888',layoutId:layout.id,position:input.position,effectiveAt:input.effectiveAt,createdBy:principal.userId,createdByName:'QC',createdAt:new Date()};},
  } as unknown as StockpileMapRepository;
  const master={findPileById:async()=>({id:mix.pileId,code:mix.pileCode,name:mix.pileName,materialKind:'LS',plantId:layout.plantId,plantCode:layout.plantCode,plantName:layout.plantName,className:'Timur',active:true,createdAt:new Date(),updatedAt:new Date()})} as unknown as MasterRepository;
  const qc={getQafRules:async()=>({lsR2O3Max:3,lsPileMin:1100,lsPileMax:5000,lsFillerMin:2000,lsFillerMax:5000,clSmMin:2.3,clSmMax:2.8,clAmMin:1.4,clAmMax:2})} as unknown as QcRepository;
  return{repository,service:createStockpileMapService(repository,master,qc),created:()=>created,reclaimerInput:()=>reclaimerInput,mapCutoff:()=>mapCutoff};
}

describe('stockpile map service',()=>{
  it('defaults the physical lot number from pile cycle and normalizes descending fractional coordinates',async()=>{
    const f=fixtures();await f.service.createLayer(principal,{layoutId:layout.id,lotNoMode:'PILE_CYCLE',logicalPileId:mix.pileId,pileCycle:9,mixIds:[mix.mixId],startPosition:10.5,endPosition:2.25,bottomLevel:.5,topLevel:2,label:null});
    expect(f.created()?.lot.lotNo).toBe('9');expect(f.created()?.layer.startPosition).toBe(2.25);expect(f.created()?.layer.endPosition).toBe(10.5);
  });
  it('accepts a manual lot number',async()=>{
    const f=fixtures();await f.service.createLayer(principal,{layoutId:layout.id,lotNoMode:'MANUAL',lotNo:'138',logicalPileId:mix.pileId,pileCycle:9,mixIds:[mix.mixId],startPosition:1,endPosition:4,bottomLevel:0,topLevel:1,label:'LSF 1200'});expect(f.created()?.lot.lotNo).toBe('138');expect(f.created()?.lot.lotNoMode).toBe('MANUAL');
  });
  it('stores a fractional REC position without snapping to a post',async()=>{
    const f=fixtures();await f.service.saveReclaimer(principal,{layoutId:layout.id,position:21.35,expectedEventId:null});expect(f.reclaimerInput()?.position).toBe(21.35);
  });
  it('reads a historical map through the end of the selected WITA business date',async()=>{
    const f=fixtures();const result=await f.service.map(principal,{layoutId:layout.id,lotStatus:'ACTIVE',asOf:'2020-08-20'});expect(result.isHistorical).toBe(true);expect(result.asOf).toBe('2020-08-20');expect(f.mapCutoff()?.toISOString()).toBe('2020-08-20T15:59:59.999Z');
  });
  it('rejects a future history date',async()=>{
    const f=fixtures();await expect(f.service.map(principal,{layoutId:layout.id,lotStatus:'ACTIVE',asOf:'2999-01-01'})).rejects.toMatchObject({code:'STOCKPILE_HISTORY_FUTURE_DATE'});
  });
});

function editingFixture() {
  const f=fixtures();
  const current={id:'77777777-7777-4777-8777-777777777777',lotId:'66666666-6666-4666-8666-666666666666',layoutId:layout.id,lotNo:'9',lotStatus:'ACTIVE' as const,label:null,startPosition:1,endPosition:4,bottomLevel:0,topLevel:1,startDepth:10,endDepth:70,version:3,createdAt:new Date(),updatedAt:new Date()};
  f.repository.findLayer=async()=>current;
  f.repository.findLot=async()=>({id:current.lotId,layoutId:layout.id,logicalPileId:mix.pileId,pileCycle:mix.pileCycle}) as Awaited<ReturnType<StockpileMapRepository['findLot']>>;
  f.repository.listLayerMixes=async()=>[mix];
  f.repository.updateLayer=vi.fn(async()=>{});
  f.repository.appendAudit=vi.fn(async()=>{});
  return {...f,current};
}

describe('stockpile geometry updates',()=>{
  it('parses depth-only edits without silently stripping the new fields',()=>{
    expect(UpdateStockpileLayerRequestSchema.parse({expectedVersion:3,startDepth:20,endDepth:60})).toEqual({expectedVersion:3,startDepth:20,endDepth:60});
    expect(UpdateStockpileLayerRequestSchema.safeParse({expectedVersion:3,endDepth:101}).success).toBe(false);
    expect(UpdateStockpileLayerRequestSchema.safeParse({expectedVersion:3,startDepth:Infinity}).success).toBe(false);
  });
  it('persists dimensions, expectedVersion and before/after audit without changing Mixes',async()=>{
    const f=editingFixture();
    await f.service.updateLayer(principal,f.current.id,{expectedVersion:3,startPosition:2,endPosition:5,bottomLevel:.25,topLevel:1.25,startDepth:25,endDepth:65});
    expect(f.repository.updateLayer).toHaveBeenCalledWith(expect.objectContaining({expectedVersion:3,startPosition:2,endPosition:5,bottomLevel:.25,topLevel:1.25,startDepth:25,endDepth:65,mixIds:[mix.mixId]}));
    expect(f.repository.appendAudit).toHaveBeenCalledWith(expect.objectContaining({beforeJson:expect.objectContaining({version:3,startDepth:10,endDepth:70}),afterJson:expect.objectContaining({version:4,startDepth:25,endDepth:65})}));
  });
  it('preserves stored depth for updates from the older x/y form',async()=>{
    const f=editingFixture();await f.service.updateLayer(principal,f.current.id,{expectedVersion:3,bottomLevel:.2});
    expect(f.repository.updateLayer).toHaveBeenCalledWith(expect.objectContaining({startDepth:10,endDepth:70}));
  });
  it('rejects invalid geometry before write or audit',async()=>{
    const f=editingFixture();await expect(f.service.updateLayer(principal,f.current.id,{expectedVersion:3,startDepth:90,endDepth:40})).rejects.toMatchObject({statusCode:400,code:'STOCKPILE_GEOMETRY_INVALID'});
    expect(f.repository.updateLayer).not.toHaveBeenCalled();expect(f.repository.appendAudit).not.toHaveBeenCalled();
  });
  it('rejects stale versions before merging partial updates',async()=>{
    const f=editingFixture();await expect(f.service.updateLayer(principal,f.current.id,{expectedVersion:2,endDepth:40})).rejects.toMatchObject({code:'STOCKPILE_VERSION_CONFLICT'});
    expect(f.repository.updateLayer).not.toHaveBeenCalled();
  });
  it('maps transactional collisions and concurrent changes without a success audit',async()=>{
    for(const code of ['STOCKPILE_LAYER_COLLISION','STOCKPILE_VERSION_CONFLICT','STOCKPILE_LOT_RECLAIMED']){
      const f=editingFixture();f.repository.updateLayer=async()=>{throw new Error(code);};
      await expect(f.service.updateLayer(principal,f.current.id,{expectedVersion:3,endDepth:40})).rejects.toMatchObject({code});
      expect(f.repository.appendAudit).not.toHaveBeenCalled();
    }
  });
  it('rejects non-QC users',async()=>{
    const f=editingFixture();await expect(f.service.updateLayer({...principal,role:'VENDOR'},f.current.id,{expectedVersion:3,endDepth:40})).rejects.toMatchObject({statusCode:403});
    expect(f.repository.updateLayer).not.toHaveBeenCalled();
  });
});
