import type { FastifyInstance } from 'fastify';
import { CancelOperationalAssignmentRequestSchema, CounterContextLookupSchema, CounterContextQuerySchema, OperationalAssignmentInputSchema, OperationalAssignmentListQuerySchema, RecordRetaseEventRequestSchema, RetaseEventListQuerySchema, RetaseSummaryQuerySchema, ReverseRetaseEventRequestSchema, UpdateOperationalAssignmentRequestSchema } from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { RetaseService } from './service';

function eventId(request:{params:unknown}){const id=(request.params as {id?:string}).id;if(!id)throw new AppError(400,'VALIDATION_ERROR','ID wajib.');return id;}

export async function registerRetaseRoutes(app:FastifyInstance,service:RetaseService){
  const counterRoles={preHandler:app.auth.requireRoles('CRUSHER_OPERATOR','SUPERVISOR_ADMIN')};
  const readRoles={preHandler:app.auth.requireRoles('CRUSHER_OPERATOR','QC_ANALYST','SUPERVISOR_ADMIN')};
  const assignmentRoles={preHandler:app.auth.requireRoles('VENDOR','QC_ANALYST','SUPERVISOR_ADMIN')};

  app.get('/counter/context',counterRoles,async(request)=>{
    const query=CounterContextLookupSchema.parse(request.query);return {ok:true as const,...await service.getContext(request.principal!,query)};
  });
  app.get('/counter/assignments',counterRoles,async(request)=>{
    const query=CounterContextQuerySchema.parse(request.query);const items=await service.getAssignments(request.principal!,query);return {ok:true as const,items,total:items.length};
  });
  app.get('/operational-assignments',assignmentRoles,async(request)=>{const query=OperationalAssignmentListQuerySchema.parse(request.query);const items=await service.listOperational(request.principal!,query);return{ok:true as const,items,total:items.length};});
  app.post('/operational-assignments',assignmentRoles,async(request)=>{const body=OperationalAssignmentInputSchema.parse(request.body);return{ok:true as const,item:await service.createOperational(request.principal!,body,request.id)};});
  app.put('/operational-assignments/:id',assignmentRoles,async(request)=>{const body=UpdateOperationalAssignmentRequestSchema.parse(request.body);return{ok:true as const,item:await service.updateOperational(request.principal!,eventId(request),body,request.id)};});
  app.post('/operational-assignments/:id/cancel',assignmentRoles,async(request)=>{const body=CancelOperationalAssignmentRequestSchema.parse(request.body);return{ok:true as const,item:await service.cancelOperational(request.principal!,eventId(request),body.reason,request.id)};});
  app.post('/retase-events',counterRoles,async(request)=>{
    const body=RecordRetaseEventRequestSchema.parse(request.body);const result=await service.record(request.principal!,body);return {ok:true as const,...result};
  });
  app.post('/retase-events/:id/reverse',counterRoles,async(request)=>{
    const body=ReverseRetaseEventRequestSchema.parse(request.body);const result=await service.reverse(request.principal!,eventId(request),body);return {ok:true as const,...result};
  });
  app.get('/retase-events',readRoles,async(request)=>{
    const query=RetaseEventListQuerySchema.parse(request.query);const result=await service.list(request.principal!,query);return {ok:true as const,...result};
  });
  app.get('/retase-summary',readRoles,async(request)=>{
    const query=RetaseSummaryQuerySchema.parse(request.query);return {ok:true as const,summary:await service.summary(request.principal!,query)};
  });
}
