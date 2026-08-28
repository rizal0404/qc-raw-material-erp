import type { FastifyInstance } from 'fastify';
import {
  CreateShiftReportRequestSchema, CreateShiftReportRevisionRequestSchema, ShiftReportCurrentQuerySchema, ShiftReportListQuerySchema,
  SubmitShiftReportRequestSchema, UpdateShiftReportDraftRequestSchema,
} from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { VendorOperationService } from './service';

function paramId(request:{params:unknown}):string{
  const id=(request.params as {id?:string}).id;
  if(!id)throw new AppError(400,'VALIDATION_ERROR','Shift report ID wajib.');
  return id;
}

export async function registerVendorOperationRoutes(app:FastifyInstance,service:VendorOperationService){
  const readRoles={preHandler:app.auth.requireRoles('VENDOR','QC_ANALYST','SUPERVISOR_ADMIN')};
  const writeRoles={preHandler:app.auth.requireRoles('VENDOR','QC_ANALYST','SUPERVISOR_ADMIN')};

  app.get('/vendor/shift-reports/current',readRoles,async(request)=>{
    const query=ShiftReportCurrentQuerySchema.parse(request.query);
    return {ok:true as const,item:await service.getCurrent(request.principal!,query)};
  });

  app.get('/vendor/shift-reports/effective-submitted',readRoles,async(request)=>{
    const query=ShiftReportCurrentQuerySchema.parse(request.query);
    return {ok:true as const,item:await service.getEffectiveSubmitted(request.principal!,query)};
  });

  app.get('/vendor/shift-reports',readRoles,async(request)=>{
    const query=ShiftReportListQuerySchema.parse(request.query);
    const result=await service.list(request.principal!,query);
    return {ok:true as const,...result};
  });

  app.get('/vendor/shift-reports/:id',readRoles,async(request)=>{
    return {ok:true as const,item:await service.getById(request.principal!,paramId(request))};
  });

  app.post('/vendor/shift-reports',writeRoles,async(request)=>{
    const body=CreateShiftReportRequestSchema.parse(request.body);
    return {ok:true as const,item:await service.createDraft(request.principal!,body,request.id)};
  });

  app.put('/vendor/shift-reports/:id/draft',writeRoles,async(request)=>{
    const body=UpdateShiftReportDraftRequestSchema.parse(request.body);
    return {ok:true as const,item:await service.updateDraft(request.principal!,paramId(request),body,request.id)};
  });

  app.post('/vendor/shift-reports/:id/submit',writeRoles,async(request)=>{
    const body=SubmitShiftReportRequestSchema.parse(request.body??{});
    return {ok:true as const,item:await service.submit(request.principal!,paramId(request),body.reason,request.id)};
  });

  app.post('/vendor/shift-reports/:id/revisions',writeRoles,async(request)=>{
    const body=CreateShiftReportRevisionRequestSchema.parse(request.body);
    return {ok:true as const,item:await service.createRevision(request.principal!,paramId(request),body.reason,request.id)};
  });
}
