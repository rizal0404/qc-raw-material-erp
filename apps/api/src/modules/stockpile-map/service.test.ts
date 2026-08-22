import { describe, expect, it } from 'vitest';
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
  return{service:createStockpileMapService(repository,master,qc),created:()=>created,reclaimerInput:()=>reclaimerInput,mapCutoff:()=>mapCutoff};
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
