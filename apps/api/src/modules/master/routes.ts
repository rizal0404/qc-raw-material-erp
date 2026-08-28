import type { FastifyInstance } from 'fastify';
import {
  CreateCrusherRequestSchema, CreateEquipmentRequestSchema, CreatePileRequestSchema, CreatePlantRequestSchema, CreateSourceRequestSchema, CreateVendorRequestSchema,
  CrusherListQuerySchema, EquipmentListQuerySchema, EquipmentTypeSchema, MaterialKindSchema, PileListQuerySchema, PlantListQuerySchema, SourceListQuerySchema,
  UpdateCrusherRequestSchema, UpdateEquipmentRequestSchema, UpdatePileRequestSchema, UpdatePlantRequestSchema, UpdateSourceRequestSchema, UpdateVendorRequestSchema,
  VendorListQuerySchema,
} from '@qc/contracts';
import { AppError } from '../../lib/errors';
import type { MasterService } from './service';

function paramId(request: { params: unknown }): string {
  const id = (request.params as { id?: string }).id;
  if (!id) throw new AppError(400, 'VALIDATION_ERROR', 'ID wajib.');
  return id;
}

function listFilter(service: MasterService, q: { search?: string | undefined; active?: string | undefined; limit: number; offset: number }) {
  return {
    ...(q.search ? { search: q.search } : {}),
    ...(service.activeFromQuery(q.active) !== undefined ? { active: service.activeFromQuery(q.active) } : {}),
    limit: q.limit,
    offset: q.offset,
  };
}

export async function registerMasterRoutes(app: FastifyInstance, service: MasterService) {
  const adminOnly = { preHandler: app.auth.requireRoles('SUPERVISOR_ADMIN') };

  app.get('/vendors', adminOnly, async (request) => {
    const q = VendorListQuerySchema.parse(request.query);
    const result = await service.listVendors({ ...listFilter(service, q), ...(q.materialKind ? { materialKind: q.materialKind } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/vendors', { preHandler: app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN') }, async (request) => {
    const body = CreateVendorRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createVendor(request.principal!, body, request.id) };
  });
  app.patch('/vendors/:id', adminOnly, async (request) => {
    const body = UpdateVendorRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updateVendor(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/plants', adminOnly, async (request) => {
    const q = PlantListQuerySchema.parse(request.query);
    const result = await service.listPlants({ ...listFilter(service, q), ...(q.materialKind ? { materialKind: q.materialKind } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/plants', adminOnly, async (request) => {
    const body = CreatePlantRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createPlant(request.principal!, body, request.id) };
  });
  app.patch('/plants/:id', adminOnly, async (request) => {
    const body = UpdatePlantRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updatePlant(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/crushers', adminOnly, async (request) => {
    const q = CrusherListQuerySchema.parse(request.query);
    const result = await service.listCrushers({ ...listFilter(service, q), ...(q.materialKind ? { materialKind: q.materialKind } : {}), ...(q.plantId ? { plantId: q.plantId } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/crushers', adminOnly, async (request) => {
    const body = CreateCrusherRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createCrusher(request.principal!, body, request.id) };
  });
  app.patch('/crushers/:id', adminOnly, async (request) => {
    const body = UpdateCrusherRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updateCrusher(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/equipment', adminOnly, async (request) => {
    const q = EquipmentListQuerySchema.parse(request.query);
    const result = await service.listEquipment({ ...listFilter(service, q), ...(q.vendorId ? { vendorId: q.vendorId } : {}), ...(q.type ? { type: q.type } : {}), ...(q.materialKind ? { materialKind: q.materialKind } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/equipment', { preHandler: app.auth.requireRoles('QC_ANALYST','SUPERVISOR_ADMIN') }, async (request) => {
    const body = CreateEquipmentRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createEquipment(request.principal!, body, request.id) };
  });
  app.patch('/equipment/:id', adminOnly, async (request) => {
    const body = UpdateEquipmentRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updateEquipment(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/sources', adminOnly, async (request) => {
    const q = SourceListQuerySchema.parse(request.query);
    const result = await service.listSources({ ...listFilter(service, q), ...(q.materialKind ? { materialKind: q.materialKind } : {}), ...(q.materialCategory ? { materialCategory: q.materialCategory } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/sources', adminOnly, async (request) => {
    const body = CreateSourceRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createSource(request.principal!, body, request.id) };
  });
  app.patch('/sources/:id', adminOnly, async (request) => {
    const body = UpdateSourceRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updateSource(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/piles', adminOnly, async (request) => {
    const q = PileListQuerySchema.parse(request.query);
    const result = await service.listPiles({ ...listFilter(service, q), ...(q.materialKind ? { materialKind: q.materialKind } : {}), ...(q.plantId ? { plantId: q.plantId } : {}) });
    return { ok: true as const, ...result };
  });
  app.post('/piles', adminOnly, async (request) => {
    const body = CreatePileRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.createPile(request.principal!, body, request.id) };
  });
  app.patch('/piles/:id', adminOnly, async (request) => {
    const body = UpdatePileRequestSchema.parse(request.body);
    return { ok: true as const, item: await service.updatePile(request.principal!, paramId(request), body, request.id) };
  });

  app.get('/lookups/master', { preHandler: app.auth.requireAuth }, async (request) => {
    const raw = request.query as { materialKind?: string };
    const materialKind = raw.materialKind ? MaterialKindSchema.parse(raw.materialKind) : undefined;
    const data = await service.getLookupBootstrap(request.principal!, materialKind);
    return { ok: true as const, ...data };
  });
  app.get('/lookups/equipment', { preHandler: app.auth.requireAuth }, async (request) => {
    const raw = request.query as { vendorId?: string; type?: string; materialKind?: string };
    const typeParsed = raw.type ? EquipmentTypeSchema.safeParse(raw.type) : null;
    if (raw.type && !typeParsed?.success) throw new AppError(400, 'VALIDATION_ERROR', 'Equipment type tidak valid.');
    const materialKind = raw.materialKind ? MaterialKindSchema.parse(raw.materialKind) : undefined;
    const items = await service.getEquipmentLookup(request.principal!, raw.vendorId, typeParsed?.success ? typeParsed.data : undefined, materialKind);
    return { ok: true as const, items };
  });
}
