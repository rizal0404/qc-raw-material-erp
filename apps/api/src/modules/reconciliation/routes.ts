import type { FastifyInstance } from 'fastify';
import {
  ConfirmRetaseAllocationRequestSchema, CreateRetaseAllocationRequestSchema, ReconciliationListQuerySchema,
  ResolveReconciliationExceptionRequestSchema, UpdateRetaseAllocationRequestSchema, WorkbenchRetaseSuggestionQuerySchema,
} from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { ReconciliationService } from './service';
const param=(request:{params:unknown},key:string)=>{const v=(request.params as Record<string,string|undefined>)[key];if(!v)throw new AppError(400,'VALIDATION_ERROR',`${key} wajib.`);return v;};
export async function registerReconciliationRoutes(app:FastifyInstance,service:ReconciliationService){
  const qc={preHandler:app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN')};
  app.get('/reconciliation',qc,async request=>({ok:true as const,...await service.list(request.principal!,ReconciliationListQuerySchema.parse(request.query))}));
  app.get('/reconciliation/exceptions/:eventId/assignment-candidates',qc,async request=>({ok:true as const,items:await service.exceptionAssignmentCandidates(request.principal!,param(request,'eventId'))}));
  app.post('/reconciliation/exceptions/:eventId/resolve',qc,async request=>({ok:true as const,item:await service.resolveException(request.principal!,param(request,'eventId'),ResolveReconciliationExceptionRequestSchema.parse(request.body),request.id)}));
  app.get('/reconciliation/:assignmentId/candidates',qc,async request=>({ok:true as const,items:await service.candidates(request.principal!,param(request,'assignmentId'))}));
  app.get('/reconciliation/:assignmentId/events',qc,async request=>({ok:true as const,items:await service.events(request.principal!,param(request,'assignmentId'))}));
  app.post('/reconciliation/allocations',qc,async request=>({ok:true as const,item:await service.createAllocation(request.principal!,CreateRetaseAllocationRequestSchema.parse(request.body),request.id)}));
  app.patch('/reconciliation/allocations/:id',qc,async request=>({ok:true as const,item:await service.updateAllocation(request.principal!,param(request,'id'),UpdateRetaseAllocationRequestSchema.parse(request.body),request.id)}));
  app.post('/reconciliation/allocations/:id/confirm',qc,async request=>({ok:true as const,item:await service.confirm(request.principal!,param(request,'id'),ConfirmRetaseAllocationRequestSchema.parse(request.body),request.id)}));
  app.get('/workbench/retase-suggestions',qc,async request=>({ok:true as const,items:await service.workbenchSuggestions(request.principal!,WorkbenchRetaseSuggestionQuerySchema.parse(request.query))}));
}
