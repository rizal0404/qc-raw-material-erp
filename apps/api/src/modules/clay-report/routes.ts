import type { FastifyInstance } from 'fastify';
import { ClayHourlyBackfillRequestSchema, ClayReportContextSchema, ClayWorkflowActionRequestSchema, CreateClayColumnRequestSchema, CreateClayOperationLogRequestSchema, PatchClayReportRequestSchema, UpdateClayColumnRequestSchema } from '@qc/contracts';
import type { ClayReportService } from './service';
import { AppError } from '../../lib/errors';
const id=(params:unknown,key='id')=>{const value=(params as Record<string,string|undefined>)[key];if(!value)throw new AppError(400,'VALIDATION_ERROR',`${key} wajib.`);return value;};
export async function registerClayReportRoutes(app:FastifyInstance,service:ClayReportService){
  const auth={preHandler:app.auth.requireRoles('CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN')};
  app.get('/clay-reports/current',auth,async request=>({ok:true as const,report:await service.current(request.principal!,ClayReportContextSchema.parse(request.query))}));
  app.post('/clay-reports/ensure',auth,async request=>({ok:true as const,report:await service.ensure(request.principal!,ClayReportContextSchema.parse(request.body),request.id)}));
  app.get('/clay-reports/:id',auth,async request=>({ok:true as const,report:await service.get(request.principal!,id(request.params))}));
  app.patch('/clay-reports/:id',auth,async request=>({ok:true as const,report:await service.patch(request.principal!,id(request.params),PatchClayReportRequestSchema.parse(request.body),request.id)}));
  app.post('/clay-reports/:id/columns',auth,async request=>({ok:true as const,report:await service.createColumn(request.principal!,id(request.params),CreateClayColumnRequestSchema.parse(request.body),request.id)}));
  app.patch('/clay-reports/:id/columns/:columnId',auth,async request=>({ok:true as const,report:await service.updateColumn(request.principal!,id(request.params),id(request.params,'columnId'),UpdateClayColumnRequestSchema.parse(request.body),request.id)}));
  app.post('/clay-reports/:id/operation-logs',auth,async request=>({ok:true as const,report:await service.addLog(request.principal!,id(request.params),CreateClayOperationLogRequestSchema.parse(request.body),request.id)}));
  app.post('/clay-reports/:id/hourly-backfill',auth,async request=>({ok:true as const,report:await service.backfill(request.principal!,id(request.params),ClayHourlyBackfillRequestSchema.parse(request.body),request.id)}));
  app.post('/clay-reports/:id/submit',auth,async request=>({ok:true as const,report:await service.submit(request.principal!,id(request.params),request.id)}));
  app.post('/clay-reports/:id/approve',auth,async request=>({ok:true as const,report:await service.approve(request.principal!,id(request.params),request.id)}));
  app.post('/clay-reports/:id/reopen',auth,async request=>{const body=ClayWorkflowActionRequestSchema.parse(request.body);return{ok:true as const,report:await service.reopen(request.principal!,id(request.params),body.reason,request.id)};});
}
