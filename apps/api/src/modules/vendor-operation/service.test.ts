import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { forbidden } from '../../lib/errors';
import { registerVendorOperationRoutes } from './routes';
import { describe, expect, it, vi } from 'vitest';
import { CreateShiftReportRequestSchema } from '@qc/contracts';
import type { MasterRepository, VendorShiftReportRecord, VendorShiftReportRepository } from '@qc/domain';
import type { AuthPrincipal } from '@qc/domain';
import { createVendorOperationService } from './service';

const vendorId='11111111-1111-4111-8111-111111111111';
const amId='22222222-2222-4222-8222-222222222222';
const aaId='33333333-3333-4333-8333-333333333333';
const sourceId='44444444-4444-4444-8444-444444444444';
const crusherId='55555555-5555-4555-8555-555555555555';

const principal:AuthPrincipal={sessionId:'s',userId:'66666666-6666-4666-8666-666666666666',username:'vendor',displayName:'Vendor User',role:'VENDOR',vendorId,status:'ACTIVE',crusherIds:[],lastLoginAt:null,sessionExpiresAt:new Date(Date.now()+3600000),sessionLastSeenAt:new Date()};

function masterStub():MasterRepository{
  return {
    async findVendorById(id:string){return id===vendorId?{id:vendorId,code:'V001',name:'Vendor 1',aliases:[],contactEmail:null,materialKinds:['LS'],active:true,createdAt:new Date(),updatedAt:new Date()}:null},
    async findEquipmentById(id:string){
      if(id===amId)return{id:amId,vendorId,vendorCode:'V001',vendorName:'Vendor 1',type:'AM',unitNo:'AM01',brand:null,model:null,aliases:[],materialKinds:['LS'],active:true,createdAt:new Date(),updatedAt:new Date()};
      if(id===aaId)return{id:aaId,vendorId,vendorCode:'V001',vendorName:'Vendor 1',type:'AA',unitNo:'AA01',brand:null,model:null,aliases:[],materialKinds:['LS'],active:true,createdAt:new Date(),updatedAt:new Date()};
      return null;
    },
    async findSourceById(id:string){return id===sourceId?{id:sourceId,code:'SRC',name:'B9',block:'B9',materialCategory:'PILE',materialKind:'LS',aliases:[],active:true,createdAt:new Date(),updatedAt:new Date()}:null},
    async findCrusherById(id:string){return id===crusherId?{id:crusherId,code:'CR_LS_5',name:'CR LS 5',materialKind:'LS',plantId:null,plantCode:null,plantName:null,active:true,createdAt:new Date(),updatedAt:new Date()}:null},
    async listShifts(){return[{code:'SHIFT_1',name:'Shift 1',startTime:'07:30',endTime:'15:30',crossesMidnight:false,active:true},{code:'SHIFT_3',name:'Shift 3',startTime:'22:30',endTime:'07:30',crossesMidnight:true,active:true}]},
  } as unknown as MasterRepository;
}

function repoStub():VendorShiftReportRepository{
  let current:VendorShiftReportRecord|null=null;
  return {
    async getCurrent(){return current},
    async getEffectiveSubmitted(){return current?.status==='SUBMITTED'?current:null},
    async getById(id){return current?.id===id?current:null},
    async list(){return{items:current?[current]:[],total:current?1:0}},
    async createDraft(input,actor){
      current={
        id:'77777777-7777-4777-8777-777777777777',operationDate:input.operationDate,shiftCode:input.shiftCode,vendorId:input.vendorId,vendorCode:'V001',vendorName:'Vendor 1',materialKind:input.materialKind,version:1,status:'DRAFT',
        am:input.am,aa:input.aa,note:input.note,revisionReason:null,revisesReportId:null,submittedAt:null,submittedBy:null,submittedByName:null,createdBy:actor,createdByName:'Vendor User',createdAt:new Date(),updatedAt:new Date(),
        assignments:input.assignments.map((a,i)=>({id:`88888888-8888-4888-8888-88888888888${i}`,reportId:'77777777-7777-4777-8777-777777777777',operationDate:input.operationDate,shiftCode:input.shiftCode,vendorId:input.vendorId,amId:a.amId,amUnitNo:'AM01',amBrand:null,amModel:null,sourceId:a.sourceId,sourceCode:'SRC',sourceName:'B9',blockSnapshot:a.blockSnapshot,materialCategory:a.materialCategory,materialKind:a.materialKind,crusherId:a.crusherId,crusherCode:'CR_LS_5',crusherName:'CR LS 5',pileId:a.pileId,pileCode:null,pileName:null,validFrom:a.validFrom,validTo:a.validTo,status:'ACTIVE',note:a.note,aa:a.aaIds.map(id=>({id,assignmentAaId:'99999999-9999-4999-8999-999999999999',unitNo:'AA01',brand:null,model:null}))})),
      };
      return current!;
    },
    async replaceDraft(_id,input){ if(!current)throw new Error('missing'); current={...current,am:input.am,aa:input.aa,note:input.note,updatedAt:new Date()};return current; },
    async submit(){if(!current)throw new Error('missing');current={...current,status:'SUBMITTED',submittedAt:new Date(),submittedBy:principal.userId,submittedByName:'Vendor User'};return current},
    async createRevision(id, actor, reason){if(!current)throw new Error('missing');current={...current,id:'revision-id',version:current.version+1,status:'DRAFT',createdBy:actor,revisesReportId:id,revisionReason:reason};return current;},
    async appendAudit(){},
  };
}

describe('VendorOperationService regression',()=>{
  it('reloads the same draft by canonical business date after save',async()=>{
    const repo=repoStub();const service=createVendorOperationService(repo,masterStub());
    const created=await service.createDraft(principal,{operationDate:'2026-08-20',shiftCode:'SHIFT_1',materialKind:'LS',am:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},aa:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},assignments:[{amId,sourceId,crusherId,validFrom:'07:30',validTo:'15:30',aaIds:[aaId]}]});
    const reloaded=await service.getCurrent(principal,{operationDate:'2026-08-20',shiftCode:'SHIFT_1',materialKind:'LS'});
    expect(reloaded?.id).toBe(created.id);
    expect(reloaded?.version).toBe(1);
    expect(reloaded?.operationDate).toBe('2026-08-20');
  });

  it('accepts Shift 3 cross-midnight assignment',async()=>{
    const service=createVendorOperationService(repoStub(),masterStub());
    const created=await service.createDraft(principal,{operationDate:'2026-08-20',shiftCode:'SHIFT_3',materialKind:'LS',am:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},aa:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},assignments:[{amId,sourceId,crusherId,validFrom:'23:00',validTo:'01:00',aaIds:[aaId]}]});
    expect(created.assignments[0]?.validTo).toBe('01:00');
  });
});

describe('QC-managed vendor WhatsApp reports', () => {
  const body = { vendorId, operationDate:'2026-08-18', shiftCode:'SHIFT_1' as const, materialKind:'LS' as const,
    am:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},
    aa:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},
    assignments:[{amId,sourceId,crusherId,aaIds:[aaId]}],
    note:'Sumber: laporan WhatsApp\n' + 'teks laporan asli '.repeat(100),
  };
  it.each(['QC_ANALYST','SUPERVISOR_ADMIN'] as const)('allows %s to create, correct, submit and revise with audit attribution',async role=>{
    const actor={...principal,role,vendorId:null};
    const repo=repoStub();const audit=vi.spyOn(repo,'appendAudit');
    const service=createVendorOperationService(repo,masterStub());
    const validated=CreateShiftReportRequestSchema.parse(body);
    const created=await service.createDraft(actor,validated);
    expect(created.note).toBe(body.note.trim());
    const updated=await service.updateDraft(actor,created.id,{...validated,note:body.note+'\nDikoreksi QC'});
    expect(updated.note).toContain('Dikoreksi QC');
    const submitted=await service.submit(actor,created.id,'Ditinjau dari WAG');
    expect(submitted.status).toBe('SUBMITTED');
    expect((await service.getEffectiveSubmitted(actor,{vendorId,operationDate:body.operationDate,shiftCode:body.shiftCode,materialKind:'LS'}))?.assignments[0]?.aa[0]?.id).toBe(aaId);
    const revision=await service.createRevision(actor,submitted.id,'Koreksi rute dari vendor');
    expect(revision.version).toBe(2);
    expect(revision.note).toBe(updated.note);
    expect(audit).toHaveBeenCalledTimes(4);
    expect(audit.mock.calls.every(([entry])=>entry.actorRoleSnapshot===role && entry.actorUserId===actor.userId)).toBe(true);
  });
  it('keeps operator writes and cross-vendor writes forbidden',async()=>{
    const service=createVendorOperationService(repoStub(),masterStub());
    await expect(service.createDraft({...principal,role:'CRUSHER_OPERATOR'},body)).rejects.toMatchObject({statusCode:403});
    await expect(service.createDraft(principal,{...body,vendorId:'another-vendor'})).rejects.toMatchObject({statusCode:403});
  });
  it('keeps submit validation and revision protection for QC',async()=>{
    const actor={...principal,role:'QC_ANALYST' as const,vendorId:null};
    const service=createVendorOperationService(repoStub(),masterStub());
    const created=await service.createDraft(actor,{...body,am:{...body.am,total:2}});
    await expect(service.submit(actor,created.id,null)).rejects.toMatchObject({code:'AM_SUMMARY_UNBALANCED'});
    await service.updateDraft(actor,created.id,body);
    await service.submit(actor,created.id,null);
    await expect(service.updateDraft(actor,created.id,body)).rejects.toMatchObject({code:'REPORT_NOT_DRAFT'});
    await expect(service.createDraft(actor,body)).rejects.toMatchObject({code:'REVISION_REQUIRED'});
  });
  it('bounds original report text without widening assignment note limits',()=>{
    expect(CreateShiftReportRequestSchema.safeParse({...body,note:'x'.repeat(20_001)}).success).toBe(false);
    expect(CreateShiftReportRequestSchema.safeParse({...body,assignments:[{...body.assignments[0],note:'x'.repeat(501)}]}).success).toBe(false);
  });
});

describe('Vendor report HTTP permissions', () => {
  it.each(['QC_ANALYST','SUPERVISOR_ADMIN','VENDOR'] as const)('allows %s through all write endpoints',async role=>{
    const app=Fastify();
    const actor={...principal,role};
    app.decorate('auth',{requireRoles:(...roles:string[])=>async(request:FastifyRequest)=>{if(!roles.includes(role))throw forbidden();request.principal=actor;}} as unknown as FastifyInstance['auth']);
    await registerVendorOperationRoutes(app,createVendorOperationService(repoStub(),masterStub()));
    try{
      const body={vendorId,operationDate:'2026-08-18',shiftCode:'SHIFT_1',materialKind:'LS',am:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},aa:{total:1,operating:1,standby:0,breakdown:0,repair:0,other:0},assignments:[{amId,sourceId,crusherId,aaIds:[aaId]}],note:'Laporan WhatsApp '+ 'teks '.repeat(150)};
      const created=await app.inject({method:'POST',url:'/vendor/shift-reports',payload:body});
      expect(created.statusCode).toBe(200);
      const id=created.json().item.id;
      expect((await app.inject({method:'PUT',url:`/vendor/shift-reports/${id}/draft`,payload:body})).statusCode).toBe(200);
      expect((await app.inject({method:'POST',url:`/vendor/shift-reports/${id}/submit`,payload:{}})).statusCode).toBe(200);
      expect((await app.inject({method:'POST',url:`/vendor/shift-reports/${id}/revisions`,payload:{reason:'Koreksi laporan WhatsApp'}})).statusCode).toBe(200);
    }finally{await app.close();}
  });
  it('keeps crusher operators blocked at the HTTP boundary',async()=>{
    const app=Fastify();const createDraft=vi.fn();
    app.decorate('auth',{requireRoles:(...roles:string[])=>async()=>{if(!roles.includes('CRUSHER_OPERATOR'))throw forbidden();}} as unknown as FastifyInstance['auth']);
    const service=createVendorOperationService(repoStub(),masterStub());
    service.createDraft=createDraft;
    await registerVendorOperationRoutes(app,service);
    try{
      const response=await app.inject({method:'POST',url:'/vendor/shift-reports',payload:{}});
      expect(response.statusCode).toBe(403);
      expect(createDraft).not.toHaveBeenCalled();
    }finally{await app.close();}
  });
});
