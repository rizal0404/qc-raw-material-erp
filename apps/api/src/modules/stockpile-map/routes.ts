import type { FastifyInstance } from 'fastify';
import { AvailableStockpileMixesQuerySchema, CreateStockpileLayerRequestSchema, SaveReclaimerPositionRequestSchema, StockpileMapQuerySchema, UpdateStockpileLayerRequestSchema, UpdateStockpileLotRequestSchema } from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { StockpileMapService } from './service';

function idParam(request:{params:unknown},key='id'):string{const value=(request.params as Record<string,string|undefined>)[key];if(!value)throw new AppError(400,'VALIDATION_ERROR',`${key} wajib.`);return value;}

export async function registerStockpileMapRoutes(app:FastifyInstance,service:StockpileMapService){
  const qc={preHandler:app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN')};
  app.get('/stockpile-map/layouts',qc,async(request)=>({ok:true as const,items:await service.layouts(request.principal!)}));
  app.get('/stockpile-map',qc,async(request)=>{const query=StockpileMapQuerySchema.parse(request.query);return{ok:true as const,...await service.map(request.principal!,query)};});
  app.get('/stockpile-map/mixes',qc,async(request)=>{const query=AvailableStockpileMixesQuerySchema.parse(request.query);return{ok:true as const,items:await service.availableMixes(request.principal!,query.layoutId,query.placement==='UNPLACED')};});
  app.post('/stockpile-map/layers',qc,async(request)=>({ok:true as const,item:await service.createLayer(request.principal!,CreateStockpileLayerRequestSchema.parse(request.body),request.id)}));
  app.patch('/stockpile-map/layers/:id',qc,async(request)=>({ok:true as const,item:await service.updateLayer(request.principal!,idParam(request),UpdateStockpileLayerRequestSchema.parse(request.body),request.id)}));
  app.patch('/stockpile-map/lots/:id',qc,async(request)=>({ok:true as const,item:await service.updateLot(request.principal!,idParam(request),UpdateStockpileLotRequestSchema.parse(request.body),request.id)}));
  app.post('/stockpile-map/reclaimer-events',qc,async(request)=>({ok:true as const,item:await service.saveReclaimer(request.principal!,SaveReclaimerPositionRequestSchema.parse(request.body),request.id)}));
}
