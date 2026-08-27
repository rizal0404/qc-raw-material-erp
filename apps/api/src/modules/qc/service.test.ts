import { describe,expect,it,vi } from 'vitest';
import { SaveMixRequestSchema } from '@qc/contracts';
import type { AuthPrincipal,MasterRepository,QcRepository } from '@qc/domain';
import { createQcService } from './service';

const sampleId='00000000-0000-4000-8000-000000000001',pileId='00000000-0000-4000-8000-000000000002',columnId='00000000-0000-4000-8000-000000000003';
const chemistry={sio2:50,al2o3:20,fe2o3:10,cao:3,mgo:null,k2o:null,na2o:null,so3:null,h2o:null};
const actor={userId:sampleId,role:'QC_ANALYST'} as AuthPrincipal;
function setup(kind:'LS'|'CL'='CL'){
  const now=new Date();
  const repository={findRawSampleById:vi.fn(async()=>({sampleId:'RAW-1',materialKind:kind,operationDate:'2026-08-27',chemistry})),
    hasConfirmedRetaseAllocation:vi.fn(async()=>true),getMixByCode:vi.fn(async()=>null),
    saveMix:vi.fn(async input=>({...input,id:columnId,createdAt:now,updatedAt:now,items:input.items})),appendAudit:vi.fn(),
    listClayWorkbenchSources:vi.fn(async()=>[{columnId,totalRetase:17,availableRetase:17}]),
  };
  const master={findPileById:async()=>({id:pileId,code:'PILE1',materialKind:kind,active:true})} as unknown as MasterRepository;
  const input=SaveMixRequestSchema.parse({materialKind:kind,operationDate:'2026-08-27',pileId,shiftCode:'SHIFT_1',tiangKe:'1',batchNo:1,pileCycle:1,defaultTonPerRetase:20,items:[{rawSampleId:sampleId,retase:5,tonPerRetase:20,clayRetaseSources:kind==='CL'?[{columnId,retase:5}]:[]}]});
  return {service:createQcService(repository as unknown as QcRepository,master),repository,input};
}
describe('Clay direct mixing workflow',()=>{
  it('passes crusher sources to mixing and never checks reconciliation',async()=>{const {service,repository,input}=setup();await service.saveMix(actor,input);expect(repository.hasConfirmedRetaseAllocation).not.toHaveBeenCalled();expect(repository.saveMix.mock.calls[0]?.[0].items[0].clayRetaseSources).toEqual([{columnId,retase:5}]);});
  it('requires direct sources and matching total',async()=>{const {service,input}=setup();input.items[0]!.clayRetaseSources=[];await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'CLAY_DIRECT_RETASE_REQUIRED'});input.items[0]!.clayRetaseSources=[{columnId,retase:4}];await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'CLAY_DIRECT_RETASE_REQUIRED'});});
  it('rejects duplicate column contributions',async()=>{const {service,input}=setup();input.items[0]!.clayRetaseSources=[{columnId,retase:2},{columnId,retase:3}];await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'DUPLICATE_CLAY_COLUMN'});});
  it('does not accept reconciliation allocations on Clay',async()=>{const {service,input}=setup();input.items[0]!.retaseAllocationIds=[columnId];await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'CLAY_DIRECT_RETASE_REQUIRED'});});
  it('preserves Limestone mapped-retase requirement',async()=>{const {service,repository,input}=setup('LS');await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'MAPPED_RETASE_REQUIRED'});expect(repository.hasConfirmedRetaseAllocation).toHaveBeenCalled();});
  it('rejects Clay source IDs on Limestone',async()=>{const {service,input}=setup('LS');input.items[0]!.clayRetaseSources=[{columnId,retase:5}];await expect(service.saveMix(actor,input)).rejects.toMatchObject({code:'MATERIAL_KIND_MISMATCH'});});
  it('lists persisted column counter totals for the selected date and shift',async()=>{const {service,repository}=setup();expect(await service.loadClayRetase('2026-08-27','SHIFT_1')).toEqual([{columnId,totalRetase:17,availableRetase:17}]);expect(repository.listClayWorkbenchSources).toHaveBeenCalledWith('2026-08-27','SHIFT_1');});
});
