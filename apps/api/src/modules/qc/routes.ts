import type { FastifyInstance } from 'fastify';
import {
  ChemistryRevisionRequestSchema, CreateRawSampleRequestSchema, ImportRawSamplesRequestSchema, MixListQuerySchema, MixSummaryQuerySchema,
  PileCumulativeQuerySchema, QafQuerySchema, RawSampleListQuerySchema, ReplaceMixRequestSchema, SaveMixRequestSchema, UpdateRawSampleRequestSchema, WorkbenchSamplesQuerySchema,
} from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { QcService } from './service';

function param(request:{params:unknown},key:string):string { const value=(request.params as Record<string,string|undefined>)[key];if(!value)throw new AppError(400,'VALIDATION_ERROR',`${key} wajib.`);return value; }

export async function registerQcRoutes(app:FastifyInstance,service:QcService){
  const qcRead={preHandler:app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN')};
  const qcWrite={preHandler:app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN')};

  app.get('/samples',qcRead,async(request)=>{const q=RawSampleListQuerySchema.parse(request.query);return{ok:true as const,...await service.listSamples(q)};});
  app.get('/samples/:id',qcRead,async(request)=>({ok:true as const,item:await service.getSample(param(request,'id'))}));
  app.post('/samples',qcWrite,async(request)=>({ok:true as const,item:await service.createSample(request.principal!,CreateRawSampleRequestSchema.parse(request.body),request.id)}));
  app.patch('/samples/:id',qcWrite,async(request)=>({ok:true as const,item:await service.updateSample(request.principal!,param(request,'id'),UpdateRawSampleRequestSchema.parse(request.body),request.id)}));
  app.post('/samples/import',qcWrite,async(request)=>({ok:true as const,result:await service.importSamples(request.principal!,ImportRawSamplesRequestSchema.parse(request.body),request.id)}));

  app.get('/workbench/samples',qcRead,async(request)=>{const q=WorkbenchSamplesQuerySchema.parse(request.query);return{ok:true as const,items:await service.loadWorkbenchSamples(q.materialKind,q.operationDate)};});

  app.get('/mixes',qcRead,async(request)=>{const q=MixListQuerySchema.parse(request.query);return{ok:true as const,...await service.listMixes(q)};});
  app.get('/mixes/:mixCode',qcRead,async(request)=>({ok:true as const,item:await service.getMix(decodeURIComponent(param(request,'mixCode')))}));
  app.post('/mixes',qcWrite,async(request)=>({ok:true as const,item:await service.saveMix(request.principal!,SaveMixRequestSchema.parse(request.body),request.id)}));
  app.post('/mixes/:mixCode/replace',qcWrite,async(request)=>({ok:true as const,item:await service.replaceMix(request.principal!,decodeURIComponent(param(request,'mixCode')),ReplaceMixRequestSchema.parse(request.body),request.id)}));
  app.get('/mix-items/:id/chemistry-revisions',qcRead,async(request)=>({ok:true as const,items:await service.chemistryHistory(param(request,'id'))}));
  app.post('/mix-items/:id/chemistry-revisions',qcWrite,async(request)=>{const body=ChemistryRevisionRequestSchema.parse(request.body);return{ok:true as const,item:await service.reviseChemistry(request.principal!,param(request,'id'),body.chemistry,body.reason,request.id)};});

  app.get('/reports/mix-summary',qcRead,async(request)=>{const q=MixSummaryQuerySchema.parse(request.query);return{ok:true as const,items:await service.mixSummary(q)};});
  app.get('/reports/pile-cumulative',qcRead,async(request)=>{const q=PileCumulativeQuerySchema.parse(request.query);return{ok:true as const,items:await service.pileCumulative(q)};});
  app.get('/reports/qaf',qcRead,async(request)=>{const q=QafQuerySchema.parse(request.query);return{ok:true as const,items:await service.qaf(q)};});
}
