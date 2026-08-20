import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { MasterRepository } from '@qc/domain';
import type * as Schema from '../schema/index';
import { auditLogs, crushers, equipment, piles, plants, shifts, sources, vendorAliases, vendors } from '../schema/index';

function activePredicate(column: AnyPgColumn, active?: boolean): SQL | undefined {
  return active === undefined ? undefined : eq(column, active);
}

function normalizeAlias(value: string): string { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }

function normalizedSearch(search?: string): string | undefined {
  const value = search?.trim();
  return value ? `%${value}%` : undefined;
}

export function createMasterRepository(db: PostgresJsDatabase<typeof Schema>): MasterRepository {
  async function vendorView(id: string) {
    const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
    return row ?? null;
  }

  async function plantView(id: string) {
    const [row] = await db.select().from(plants).where(eq(plants.id, id)).limit(1);
    return row ?? null;
  }

  async function crusherView(id: string) {
    const [row] = await db.select({
      id: crushers.id, code: crushers.code, name: crushers.name, materialKind: crushers.materialKind,
      plantId: crushers.plantId, plantCode: plants.code, plantName: plants.name, active: crushers.active,
      createdAt: crushers.createdAt, updatedAt: crushers.updatedAt,
    }).from(crushers).leftJoin(plants, eq(plants.id, crushers.plantId)).where(eq(crushers.id, id)).limit(1);
    return row ?? null;
  }

  async function equipmentView(id: string) {
    const [row] = await db.select({
      id: equipment.id, vendorId: equipment.vendorId, vendorCode: vendors.code, vendorName: vendors.name,
      type: equipment.type, unitNo: equipment.unitNo, brand: equipment.brand, model: equipment.model,
      aliases: equipment.aliases, active: equipment.active, createdAt: equipment.createdAt, updatedAt: equipment.updatedAt,
    }).from(equipment).innerJoin(vendors, eq(vendors.id, equipment.vendorId)).where(eq(equipment.id, id)).limit(1);
    return row ?? null;
  }

  async function sourceView(id: string) {
    const [row] = await db.select().from(sources).where(eq(sources.id, id)).limit(1);
    return row ?? null;
  }

  async function pileView(id: string) {
    const [row] = await db.select({
      id: piles.id, code: piles.code, name: piles.name, materialKind: piles.materialKind,
      plantId: piles.plantId, plantCode: plants.code, plantName: plants.name, className: piles.className,
      active: piles.active, createdAt: piles.createdAt, updatedAt: piles.updatedAt,
    }).from(piles).leftJoin(plants, eq(plants.id, piles.plantId)).where(eq(piles.id, id)).limit(1);
    return row ?? null;
  }

  return {
    async listVendors(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(
        activePredicate(vendors.active, filter.active),
        search ? or(ilike(vendors.code, search), ilike(vendors.name, search), sql`array_to_string(${vendors.aliases}, ' ') ILIKE ${search}`) : undefined,
      );
      const [items, totalRows] = await Promise.all([
        db.select().from(vendors).where(where).orderBy(asc(vendors.name)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(vendors).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findVendorById: vendorView,
    async findVendorByCode(code) {
      const [row] = await db.select().from(vendors).where(sql`lower(${vendors.code}) = lower(${code})`).limit(1);
      return row ?? null;
    },
    async findVendorByAlias(normalizedAlias) {
      const [row] = await db.select({ vendorId: vendorAliases.vendorId }).from(vendorAliases).where(eq(vendorAliases.normalizedAlias, normalizedAlias)).limit(1);
      return row ? vendorView(row.vendorId) : null;
    },
    async createVendor(input) {
      return db.transaction(async (tx) => {
        const [row] = await tx.insert(vendors).values(input).returning();
        if (!row) throw new Error('Failed to create vendor');
        if (input.aliases.length) {
          await tx.insert(vendorAliases).values(input.aliases.map((alias) => ({ vendorId: row.id, alias, normalizedAlias: normalizeAlias(alias) })));
        }
        return row;
      });
    },
    async updateVendor(id, patch) {
      return db.transaction(async (tx) => {
        const [row] = await tx.update(vendors).set({ ...patch, updatedAt: new Date() }).where(eq(vendors.id, id)).returning();
        if (!row) return null;
        if (patch.aliases !== undefined) {
          await tx.delete(vendorAliases).where(eq(vendorAliases.vendorId, id));
          if (patch.aliases.length) await tx.insert(vendorAliases).values(patch.aliases.map((alias) => ({ vendorId: id, alias, normalizedAlias: normalizeAlias(alias) })));
        }
        return row;
      });
    },

    async listPlants(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(activePredicate(plants.active, filter.active), search ? or(ilike(plants.code, search), ilike(plants.name, search)) : undefined);
      const [items, totalRows] = await Promise.all([
        db.select().from(plants).where(where).orderBy(asc(plants.name)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(plants).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findPlantById: plantView,
    async findPlantByCode(code) {
      const [row] = await db.select().from(plants).where(sql`lower(${plants.code}) = lower(${code})`).limit(1);
      return row ?? null;
    },
    async createPlant(input) {
      const [row] = await db.insert(plants).values(input).returning();
      if (!row) throw new Error('Failed to create plant');
      return row;
    },
    async updatePlant(id, patch) {
      const [row] = await db.update(plants).set({ ...patch, updatedAt: new Date() }).where(eq(plants.id, id)).returning();
      return row ?? null;
    },

    async listCrushers(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(
        activePredicate(crushers.active, filter.active),
        filter.materialKind ? eq(crushers.materialKind, filter.materialKind) : undefined,
        filter.plantId ? eq(crushers.plantId, filter.plantId) : undefined,
        search ? or(ilike(crushers.code, search), ilike(crushers.name, search)) : undefined,
      );
      const selection = { id: crushers.id, code: crushers.code, name: crushers.name, materialKind: crushers.materialKind, plantId: crushers.plantId, plantCode: plants.code, plantName: plants.name, active: crushers.active, createdAt: crushers.createdAt, updatedAt: crushers.updatedAt };
      const [items, totalRows] = await Promise.all([
        db.select(selection).from(crushers).leftJoin(plants, eq(plants.id, crushers.plantId)).where(where).orderBy(asc(crushers.code)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(crushers).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findCrusherById: crusherView,
    async findCrusherByCode(code) {
      const [row] = await db.select({ id: crushers.id }).from(crushers).where(sql`lower(${crushers.code}) = lower(${code})`).limit(1);
      return row ? crusherView(row.id) : null;
    },
    async createCrusher(input) {
      const [row] = await db.insert(crushers).values(input).returning({ id: crushers.id });
      if (!row) throw new Error('Failed to create crusher');
      const created = await crusherView(row.id);
      if (!created) throw new Error('Failed to reload crusher');
      return created;
    },
    async updateCrusher(id, patch) {
      const [row] = await db.update(crushers).set({ ...patch, updatedAt: new Date() }).where(eq(crushers.id, id)).returning({ id: crushers.id });
      return row ? crusherView(row.id) : null;
    },

    async listEquipment(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(
        activePredicate(equipment.active, filter.active),
        filter.vendorId ? eq(equipment.vendorId, filter.vendorId) : undefined,
        filter.type ? eq(equipment.type, filter.type) : undefined,
        search ? or(ilike(equipment.unitNo, search), ilike(equipment.brand, search), ilike(equipment.model, search), ilike(vendors.name, search)) : undefined,
      );
      const selection = { id: equipment.id, vendorId: equipment.vendorId, vendorCode: vendors.code, vendorName: vendors.name, type: equipment.type, unitNo: equipment.unitNo, brand: equipment.brand, model: equipment.model, aliases: equipment.aliases, active: equipment.active, createdAt: equipment.createdAt, updatedAt: equipment.updatedAt };
      const [items, totalRows] = await Promise.all([
        db.select(selection).from(equipment).innerJoin(vendors, eq(vendors.id, equipment.vendorId)).where(where).orderBy(asc(vendors.name), asc(equipment.type), asc(equipment.unitNo)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(equipment).innerJoin(vendors, eq(vendors.id, equipment.vendorId)).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findEquipmentById: equipmentView,
    async findEquipmentByBusinessKey(vendorId, type, unitNo) {
      const [row] = await db.select({ id: equipment.id }).from(equipment).where(and(eq(equipment.vendorId, vendorId), eq(equipment.type, type), sql`lower(${equipment.unitNo}) = lower(${unitNo})`)).limit(1);
      return row ? equipmentView(row.id) : null;
    },
    async createEquipment(input) {
      const [row] = await db.insert(equipment).values(input).returning({ id: equipment.id });
      if (!row) throw new Error('Failed to create equipment');
      const created = await equipmentView(row.id);
      if (!created) throw new Error('Failed to reload equipment');
      return created;
    },
    async updateEquipment(id, patch) {
      const [row] = await db.update(equipment).set({ ...patch, updatedAt: new Date() }).where(eq(equipment.id, id)).returning({ id: equipment.id });
      return row ? equipmentView(row.id) : null;
    },

    async listSources(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(
        activePredicate(sources.active, filter.active),
        filter.materialKind ? eq(sources.materialKind, filter.materialKind) : undefined,
        filter.materialCategory ? eq(sources.materialCategory, filter.materialCategory) : undefined,
        search ? or(ilike(sources.code, search), ilike(sources.name, search), ilike(sources.block, search), ilike(sources.materialCategory, search)) : undefined,
      );
      const [items, totalRows] = await Promise.all([
        db.select().from(sources).where(where).orderBy(asc(sources.materialKind), asc(sources.code)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(sources).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findSourceById: sourceView,
    async findSourceByCode(code) {
      const [row] = await db.select().from(sources).where(sql`lower(${sources.code}) = lower(${code})`).limit(1);
      return row ?? null;
    },
    async createSource(input) {
      const [row] = await db.insert(sources).values(input).returning();
      if (!row) throw new Error('Failed to create source');
      return row;
    },
    async updateSource(id, patch) {
      const [row] = await db.update(sources).set({ ...patch, updatedAt: new Date() }).where(eq(sources.id, id)).returning();
      return row ?? null;
    },

    async listPiles(filter) {
      const search = normalizedSearch(filter.search);
      const where = and(
        activePredicate(piles.active, filter.active),
        filter.materialKind ? eq(piles.materialKind, filter.materialKind) : undefined,
        filter.plantId ? eq(piles.plantId, filter.plantId) : undefined,
        search ? or(ilike(piles.code, search), ilike(piles.name, search), ilike(piles.className, search)) : undefined,
      );
      const selection = { id: piles.id, code: piles.code, name: piles.name, materialKind: piles.materialKind, plantId: piles.plantId, plantCode: plants.code, plantName: plants.name, className: piles.className, active: piles.active, createdAt: piles.createdAt, updatedAt: piles.updatedAt };
      const [items, totalRows] = await Promise.all([
        db.select(selection).from(piles).leftJoin(plants, eq(plants.id, piles.plantId)).where(where).orderBy(asc(piles.materialKind), asc(piles.name)).limit(filter.limit).offset(filter.offset),
        db.select({ value: count() }).from(piles).where(where),
      ]);
      return { items, total: Number(totalRows[0]?.value ?? 0) };
    },
    findPileById: pileView,
    async findPileByCode(code) {
      const [row] = await db.select({ id: piles.id }).from(piles).where(sql`lower(${piles.code}) = lower(${code})`).limit(1);
      return row ? pileView(row.id) : null;
    },
    async createPile(input) {
      const [row] = await db.insert(piles).values(input).returning({ id: piles.id });
      if (!row) throw new Error('Failed to create pile');
      const created = await pileView(row.id);
      if (!created) throw new Error('Failed to reload pile');
      return created;
    },
    async updatePile(id, patch) {
      const [row] = await db.update(piles).set({ ...patch, updatedAt: new Date() }).where(eq(piles.id, id)).returning({ id: piles.id });
      return row ? pileView(row.id) : null;
    },

    async listShifts(activeOnly = false) {
      const rows = await db.select().from(shifts).where(activeOnly ? eq(shifts.active, true) : undefined).orderBy(asc(shifts.startTime));
      return rows;
    },
    async listMaterialCategories(activeOnly = true) {
      const where = activeOnly ? eq(sources.active, true) : undefined;
      const rows = await db.selectDistinct({ value: sources.materialCategory }).from(sources).where(where).orderBy(asc(sources.materialCategory));
      const categories = rows.map((row) => row.value).filter(Boolean);
      return Array.from(new Set(['PILE', 'FILLER', ...categories]));
    },
    async appendAudit(input) {
      await db.insert(auditLogs).values({
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        beforeJson: input.beforeJson as Record<string, unknown> | undefined,
        afterJson: input.afterJson as Record<string, unknown> | undefined,
        reason: input.reason ?? null,
        requestId: input.requestId,
      });
    },
  };
}
