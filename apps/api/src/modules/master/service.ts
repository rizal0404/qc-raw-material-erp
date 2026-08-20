import type {
  CreateCrusherRequest, CreateEquipmentRequest, CreatePileRequest, CreatePlantRequest, CreateSourceRequest, CreateVendorRequest,
  EquipmentType, MaterialKind, Role, UpdateCrusherRequest, UpdateEquipmentRequest, UpdatePileRequest, UpdatePlantRequest, UpdateSourceRequest, UpdateVendorRequest,
} from '@qc/contracts';
import type { AuthPrincipal, CrusherRecord, EquipmentRecord, MasterRepository, PileRecord, PlantRecord, SourceRecord, VendorRecord } from '@qc/domain';
import { AppError, conflict, notFound } from '../../lib/errors';

export interface MasterListInput {
  search?: string | undefined;
  active?: boolean | undefined;
  limit: number;
  offset: number;
}

function canonicalCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}
function canonicalUnitNo(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}
function canonicalCategory(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}
function cleanText(value: string | null | undefined): string | null {
  const text = value?.trim();
  return text ? text : null;
}
function cleanAliases(values: string[] | undefined): string[] {
  return Array.from(new Set((values ?? []).map((x) => x.trim()).filter(Boolean)));
}
function normalizedAlias(value: string): string { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
function assertReasonWhenChangingActive(before: boolean, next: boolean | undefined, reason?: string) {
  if (next !== undefined && next !== before && !reason?.trim()) {
    throw new AppError(400, 'REASON_REQUIRED', 'Alasan wajib diisi saat mengaktifkan/menonaktifkan master data.');
  }
}
function activeFromQuery(value: string | undefined): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}
function omitReason<T extends { reason?: string | undefined }>(input: T): Omit<T, 'reason'> {
  const { reason: _reason, ...rest } = input;
  return rest;
}
function iso(value: Date): string { return value.toISOString(); }

export function createMasterService(repository: MasterRepository) {
  async function ensureVendor(vendorId: string) {
    const vendor = await repository.findVendorById(vendorId);
    if (!vendor) throw notFound('Vendor tidak ditemukan.');
    if (!vendor.active) throw new AppError(400, 'INACTIVE_REFERENCE', 'Vendor yang dinonaktifkan tidak dapat digunakan untuk master baru.');
    return vendor;
  }
  async function ensurePlant(plantId: string | null | undefined) {
    if (!plantId) return null;
    const plant = await repository.findPlantById(plantId);
    if (!plant) throw notFound('Plant tidak ditemukan.');
    if (!plant.active) throw new AppError(400, 'INACTIVE_REFERENCE', 'Plant yang dinonaktifkan tidak dapat digunakan untuk master baru.');
    return plant;
  }
  async function ensureUniqueCode(entity: string, code: string, currentId?: string) {
    const canonical = canonicalCode(code);
    let existing: { id: string } | null = null;
    if (entity === 'VENDOR') existing = await repository.findVendorByCode(canonical);
    if (entity === 'PLANT') existing = await repository.findPlantByCode(canonical);
    if (entity === 'CRUSHER') existing = await repository.findCrusherByCode(canonical);
    if (entity === 'SOURCE') existing = await repository.findSourceByCode(canonical);
    if (entity === 'PILE') existing = await repository.findPileByCode(canonical);
    if (existing && existing.id !== currentId) throw conflict('MASTER_CODE_EXISTS', `Code ${canonical} sudah digunakan.`);
    return canonical;
  }
  async function ensureVendorAliasesAvailable(aliases: string[], currentVendorId?: string) {
    for (const alias of aliases) {
      const existing = await repository.findVendorByAlias(normalizedAlias(alias));
      if (existing && existing.id !== currentVendorId) throw conflict('VENDOR_ALIAS_EXISTS', `Alias vendor "${alias}" sudah digunakan oleh ${existing.name}.`);
    }
  }

  async function audit(actor: AuthPrincipal, action: string, entityType: string, entityId: string, beforeJson: unknown, afterJson: unknown, reason: string | undefined, requestId?: string) {
    await repository.appendAudit({
      actorUserId: actor.userId,
      actorRoleSnapshot: actor.role,
      action,
      entityType,
      entityId,
      beforeJson,
      afterJson,
      reason: reason?.trim() || null,
      ...(requestId ? { requestId } : {}),
    });
  }

  const mapVendor = (x: VendorRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
  const mapPlant = (x: PlantRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
  const mapCrusher = (x: CrusherRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
  const mapEquipment = (x: EquipmentRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
  const mapSource = (x: SourceRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });
  const mapPile = (x: PileRecord) => ({ ...x, createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt) });

  return {
    activeFromQuery,

    async listVendors(filter: MasterListInput) {
      const result = await repository.listVendors(filter);
      return { items: result.items.map(mapVendor), total: result.total };
    },
    async createVendor(actor: AuthPrincipal, input: CreateVendorRequest, requestId?: string) {
      const code = await ensureUniqueCode('VENDOR', input.code);
      const aliases = cleanAliases(input.aliases);
      await ensureVendorAliasesAvailable(aliases);
      const created = await repository.createVendor({
        code, name: input.name.trim(), aliases, contactEmail: cleanText(input.contactEmail),
      });
      await audit(actor, 'MASTER_VENDOR_CREATED', 'VENDOR', created.id, null, created, undefined, requestId);
      return mapVendor(created);
    },
    async updateVendor(actor: AuthPrincipal, id: string, input: UpdateVendorRequest, requestId?: string) {
      const before = await repository.findVendorById(id);
      if (!before) throw notFound('Vendor tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const patch: Parameters<MasterRepository['updateVendor']>[1] = {};
      if (raw.code !== undefined) patch.code = await ensureUniqueCode('VENDOR', raw.code, id);
      if (raw.name !== undefined) patch.name = raw.name.trim();
      if (raw.aliases !== undefined) { const aliases = cleanAliases(raw.aliases); await ensureVendorAliasesAvailable(aliases, id); patch.aliases = aliases; }
      if (raw.contactEmail !== undefined) patch.contactEmail = cleanText(raw.contactEmail);
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updateVendor(id, patch);
      if (!updated) throw notFound('Vendor tidak ditemukan.');
      await audit(actor, 'MASTER_VENDOR_UPDATED', 'VENDOR', id, before, updated, input.reason, requestId);
      return mapVendor(updated);
    },

    async listPlants(filter: MasterListInput) {
      const result = await repository.listPlants(filter);
      return { items: result.items.map(mapPlant), total: result.total };
    },
    async createPlant(actor: AuthPrincipal, input: CreatePlantRequest, requestId?: string) {
      const code = await ensureUniqueCode('PLANT', input.code);
      const created = await repository.createPlant({ code, name: input.name.trim() });
      await audit(actor, 'MASTER_PLANT_CREATED', 'PLANT', created.id, null, created, undefined, requestId);
      return mapPlant(created);
    },
    async updatePlant(actor: AuthPrincipal, id: string, input: UpdatePlantRequest, requestId?: string) {
      const before = await repository.findPlantById(id);
      if (!before) throw notFound('Plant tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const patch: Parameters<MasterRepository['updatePlant']>[1] = {};
      if (raw.code !== undefined) patch.code = await ensureUniqueCode('PLANT', raw.code, id);
      if (raw.name !== undefined) patch.name = raw.name.trim();
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updatePlant(id, patch);
      if (!updated) throw notFound('Plant tidak ditemukan.');
      await audit(actor, 'MASTER_PLANT_UPDATED', 'PLANT', id, before, updated, input.reason, requestId);
      return mapPlant(updated);
    },

    async listCrushers(filter: MasterListInput & { materialKind?: MaterialKind | undefined; plantId?: string | undefined }) {
      const result = await repository.listCrushers(filter);
      return { items: result.items.map(mapCrusher), total: result.total };
    },
    async createCrusher(actor: AuthPrincipal, input: CreateCrusherRequest, requestId?: string) {
      const code = await ensureUniqueCode('CRUSHER', input.code);
      await ensurePlant(input.plantId);
      const created = await repository.createCrusher({ code, name: input.name.trim(), materialKind: input.materialKind, plantId: input.plantId ?? null });
      await audit(actor, 'MASTER_CRUSHER_CREATED', 'CRUSHER', created.id, null, created, undefined, requestId);
      return mapCrusher(created);
    },
    async updateCrusher(actor: AuthPrincipal, id: string, input: UpdateCrusherRequest, requestId?: string) {
      const before = await repository.findCrusherById(id);
      if (!before) throw notFound('Crusher tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const patch: Parameters<MasterRepository['updateCrusher']>[1] = {};
      if (raw.code !== undefined) patch.code = await ensureUniqueCode('CRUSHER', raw.code, id);
      if (raw.name !== undefined) patch.name = raw.name.trim();
      if (raw.materialKind !== undefined) patch.materialKind = raw.materialKind;
      if (raw.plantId !== undefined) { await ensurePlant(raw.plantId); patch.plantId = raw.plantId; }
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updateCrusher(id, patch);
      if (!updated) throw notFound('Crusher tidak ditemukan.');
      await audit(actor, 'MASTER_CRUSHER_UPDATED', 'CRUSHER', id, before, updated, input.reason, requestId);
      return mapCrusher(updated);
    },

    async listEquipment(filter: MasterListInput & { vendorId?: string | undefined; type?: EquipmentType | undefined }) {
      const result = await repository.listEquipment(filter);
      return { items: result.items.map(mapEquipment), total: result.total };
    },
    async createEquipment(actor: AuthPrincipal, input: CreateEquipmentRequest, requestId?: string) {
      await ensureVendor(input.vendorId);
      const unitNo = canonicalUnitNo(input.unitNo);
      const duplicate = await repository.findEquipmentByBusinessKey(input.vendorId, input.type, unitNo);
      if (duplicate) throw conflict('EQUIPMENT_EXISTS', `${input.type} ${unitNo} sudah terdaftar untuk vendor tersebut.`);
      const created = await repository.createEquipment({ vendorId: input.vendorId, type: input.type, unitNo, brand: cleanText(input.brand), model: cleanText(input.model), aliases: cleanAliases(input.aliases) });
      await audit(actor, 'MASTER_EQUIPMENT_CREATED', 'EQUIPMENT', created.id, null, created, undefined, requestId);
      return mapEquipment(created);
    },
    async updateEquipment(actor: AuthPrincipal, id: string, input: UpdateEquipmentRequest, requestId?: string) {
      const before = await repository.findEquipmentById(id);
      if (!before) throw notFound('Equipment tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const vendorId = raw.vendorId ?? before.vendorId;
      const type = raw.type ?? before.type;
      const unitNo = raw.unitNo !== undefined ? canonicalUnitNo(raw.unitNo) : before.unitNo;
      if (raw.vendorId !== undefined) await ensureVendor(raw.vendorId);
      if (raw.vendorId !== undefined || raw.type !== undefined || raw.unitNo !== undefined) {
        const duplicate = await repository.findEquipmentByBusinessKey(vendorId, type, unitNo);
        if (duplicate && duplicate.id !== id) throw conflict('EQUIPMENT_EXISTS', `${type} ${unitNo} sudah terdaftar untuk vendor tersebut.`);
      }
      const patch: Parameters<MasterRepository['updateEquipment']>[1] = {};
      if (raw.vendorId !== undefined) patch.vendorId = raw.vendorId;
      if (raw.type !== undefined) patch.type = raw.type;
      if (raw.unitNo !== undefined) patch.unitNo = unitNo;
      if (raw.brand !== undefined) patch.brand = cleanText(raw.brand);
      if (raw.model !== undefined) patch.model = cleanText(raw.model);
      if (raw.aliases !== undefined) patch.aliases = cleanAliases(raw.aliases);
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updateEquipment(id, patch);
      if (!updated) throw notFound('Equipment tidak ditemukan.');
      await audit(actor, 'MASTER_EQUIPMENT_UPDATED', 'EQUIPMENT', id, before, updated, input.reason, requestId);
      return mapEquipment(updated);
    },

    async listSources(filter: MasterListInput & { materialKind?: MaterialKind | undefined; materialCategory?: string | undefined }) {
      const result = await repository.listSources(filter);
      return { items: result.items.map(mapSource), total: result.total };
    },
    async createSource(actor: AuthPrincipal, input: CreateSourceRequest, requestId?: string) {
      const code = await ensureUniqueCode('SOURCE', input.code);
      const created = await repository.createSource({ code, name: input.name.trim(), block: cleanText(input.block), materialCategory: canonicalCategory(input.materialCategory), materialKind: input.materialKind, aliases: cleanAliases(input.aliases) });
      await audit(actor, 'MASTER_SOURCE_CREATED', 'SOURCE', created.id, null, created, undefined, requestId);
      return mapSource(created);
    },
    async updateSource(actor: AuthPrincipal, id: string, input: UpdateSourceRequest, requestId?: string) {
      const before = await repository.findSourceById(id);
      if (!before) throw notFound('Source tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const patch: Parameters<MasterRepository['updateSource']>[1] = {};
      if (raw.code !== undefined) patch.code = await ensureUniqueCode('SOURCE', raw.code, id);
      if (raw.name !== undefined) patch.name = raw.name.trim();
      if (raw.block !== undefined) patch.block = cleanText(raw.block);
      if (raw.materialCategory !== undefined) patch.materialCategory = canonicalCategory(raw.materialCategory);
      if (raw.materialKind !== undefined) patch.materialKind = raw.materialKind;
      if (raw.aliases !== undefined) patch.aliases = cleanAliases(raw.aliases);
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updateSource(id, patch);
      if (!updated) throw notFound('Source tidak ditemukan.');
      await audit(actor, 'MASTER_SOURCE_UPDATED', 'SOURCE', id, before, updated, input.reason, requestId);
      return mapSource(updated);
    },

    async listPiles(filter: MasterListInput & { materialKind?: MaterialKind | undefined; plantId?: string | undefined }) {
      const result = await repository.listPiles(filter);
      return { items: result.items.map(mapPile), total: result.total };
    },
    async createPile(actor: AuthPrincipal, input: CreatePileRequest, requestId?: string) {
      const code = await ensureUniqueCode('PILE', input.code);
      await ensurePlant(input.plantId);
      const created = await repository.createPile({ code, name: input.name.trim(), materialKind: input.materialKind, plantId: input.plantId ?? null, className: cleanText(input.className) });
      await audit(actor, 'MASTER_PILE_CREATED', 'PILE', created.id, null, created, undefined, requestId);
      return mapPile(created);
    },
    async updatePile(actor: AuthPrincipal, id: string, input: UpdatePileRequest, requestId?: string) {
      const before = await repository.findPileById(id);
      if (!before) throw notFound('Pile tidak ditemukan.');
      assertReasonWhenChangingActive(before.active, input.active, input.reason);
      const raw = omitReason(input);
      const patch: Parameters<MasterRepository['updatePile']>[1] = {};
      if (raw.code !== undefined) patch.code = await ensureUniqueCode('PILE', raw.code, id);
      if (raw.name !== undefined) patch.name = raw.name.trim();
      if (raw.materialKind !== undefined) patch.materialKind = raw.materialKind;
      if (raw.plantId !== undefined) { await ensurePlant(raw.plantId); patch.plantId = raw.plantId; }
      if (raw.className !== undefined) patch.className = cleanText(raw.className);
      if (raw.active !== undefined) patch.active = raw.active;
      const updated = await repository.updatePile(id, patch);
      if (!updated) throw notFound('Pile tidak ditemukan.');
      await audit(actor, 'MASTER_PILE_UPDATED', 'PILE', id, before, updated, input.reason, requestId);
      return mapPile(updated);
    },

    async validateIamScope(role: Role, vendorId: string | null, crusherIds: string[]) {
      if (role === 'VENDOR') {
        if (!vendorId) throw new AppError(400, 'VALIDATION_ERROR', 'vendorId wajib untuk role VENDOR.');
        await ensureVendor(vendorId);
      }
      if (role === 'CRUSHER_OPERATOR') {
        for (const crusherId of Array.from(new Set(crusherIds))) {
          const crusher = await repository.findCrusherById(crusherId);
          if (!crusher) throw notFound('Crusher scope tidak ditemukan.');
          if (!crusher.active) throw new AppError(400, 'INACTIVE_REFERENCE', `Crusher ${crusher.name} sedang INACTIVE.`);
        }
      }
    },

    async getLookupBootstrap(principal: AuthPrincipal) {
      const [vendorResult, plantsResult, crusherResult, sourceResult, pileResult, shifts, materialCategories] = await Promise.all([
        repository.listVendors({ active: true, limit: 250, offset: 0 }),
        repository.listPlants({ active: true, limit: 250, offset: 0 }),
        repository.listCrushers({ active: true, limit: 250, offset: 0 }),
        repository.listSources({ active: true, limit: 250, offset: 0 }),
        repository.listPiles({ active: true, limit: 250, offset: 0 }),
        repository.listShifts(true),
        repository.listMaterialCategories(true),
      ]);
      const vendors = principal.role === 'VENDOR' ? vendorResult.items.filter((v) => v.id === principal.vendorId) : vendorResult.items;
      const crusherItems = principal.role === 'CRUSHER_OPERATOR' && principal.crusherIds.length
        ? crusherResult.items.filter((c) => principal.crusherIds.includes(c.id))
        : crusherResult.items;
      return {
        vendors: vendors.map((v) => ({ id: v.id, code: v.code, label: v.name, active: v.active })),
        plants: plantsResult.items.map((v) => ({ id: v.id, code: v.code, label: v.name, active: v.active })),
        crushers: crusherItems.map((v) => ({ id: v.id, code: v.code, label: v.name, active: v.active, materialKind: v.materialKind, plantId: v.plantId })),
        sources: sourceResult.items.map((v) => ({ id: v.id, code: v.code, label: v.name, active: v.active, materialKind: v.materialKind, materialCategory: v.materialCategory, block: v.block })),
        piles: pileResult.items.map((v) => ({ id: v.id, code: v.code, label: v.name, active: v.active, materialKind: v.materialKind, plantId: v.plantId, className: v.className })),
        shifts: shifts.map((v) => ({ code: v.code, label: v.name, startTime: v.startTime, endTime: v.endTime, crossesMidnight: v.crossesMidnight })),
        materialCategories,
      };
    },

    async getEquipmentLookup(principal: AuthPrincipal, vendorId?: string, type?: EquipmentType) {
      let effectiveVendorId = vendorId;
      if (principal.role === 'VENDOR') effectiveVendorId = principal.vendorId ?? undefined;
      const result = await repository.listEquipment({ active: true, limit: 250, offset: 0, ...(effectiveVendorId ? { vendorId: effectiveVendorId } : {}), ...(type ? { type } : {}) });
      return result.items.map((v) => ({ id: v.id, code: `${v.vendorCode}:${v.type}:${v.unitNo}`, label: `${v.unitNo}${v.brand ? ` · ${v.brand}` : ''}`, active: v.active, vendorId: v.vendorId, type: v.type, unitNo: v.unitNo }));
    },
  };
}

export type MasterService = ReturnType<typeof createMasterService>;
