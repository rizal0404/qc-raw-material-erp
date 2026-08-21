import { boolean, check, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { WarehousePostMark } from '@qc/domain';
import { materialKindEnum, stockpileLotNoModeEnum, stockpileLotStatusEnum, warehouseZoneKindEnum } from './enums';
import { users } from './iam';
import { piles, plants } from './master';
import { mixes } from './mixing';

export const warehouseLayouts = pgTable('warehouse_layouts', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  plantId: uuid('plant_id').notNull().references(() => plants.id, { onDelete: 'restrict' }),
  axisLength: numeric('axis_length', { precision: 12, scale: 4 }).notNull(),
  maxLevel: numeric('max_level', { precision: 12, scale: 4 }).notNull().default('3'),
  postMarks: jsonb('post_marks').$type<WarehousePostMark[]>().notNull().default([]),
  hopperSide: text('hopper_side').notNull().default('START'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('warehouse_layouts_code_uq').on(t.code),
  index('warehouse_layouts_plant_kind_idx').on(t.plantId, t.materialKind),
  check('warehouse_layouts_axis_check', sql`${t.axisLength} > 0 AND ${t.maxLevel} > 0`),
  check('warehouse_layouts_hopper_side_check', sql`${t.hopperSide} IN ('START','END')`),
]);

export const warehouseZones = pgTable('warehouse_zones', {
  id: uuid('id').primaryKey().defaultRandom(),
  layoutId: uuid('layout_id').notNull().references(() => warehouseLayouts.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  label: text('label').notNull(),
  kind: warehouseZoneKindEnum('kind').notNull(),
  startPosition: numeric('start_position', { precision: 12, scale: 4 }).notNull(),
  endPosition: numeric('end_position', { precision: 12, scale: 4 }).notNull(),
  bottomLevel: numeric('bottom_level', { precision: 12, scale: 4 }).notNull().default('0'),
  topLevel: numeric('top_level', { precision: 12, scale: 4 }).notNull().default('3'),
  displayOrder: integer('display_order').notNull().default(0),
}, (t) => [
  uniqueIndex('warehouse_zones_layout_code_uq').on(t.layoutId, t.code),
  index('warehouse_zones_layout_order_idx').on(t.layoutId, t.displayOrder),
  check('warehouse_zones_geometry_check', sql`${t.startPosition} >= 0 AND ${t.endPosition} > ${t.startPosition} AND ${t.bottomLevel} >= 0 AND ${t.topLevel} > ${t.bottomLevel}`),
]);

export const stockpileLots = pgTable('stockpile_lots', {
  id: uuid('id').primaryKey().defaultRandom(),
  layoutId: uuid('layout_id').notNull().references(() => warehouseLayouts.id, { onDelete: 'restrict' }),
  logicalPileId: uuid('logical_pile_id').notNull().references(() => piles.id, { onDelete: 'restrict' }),
  lotNo: text('lot_no').notNull(),
  lotNoMode: stockpileLotNoModeEnum('lot_no_mode').notNull().default('PILE_CYCLE'),
  pileCycle: integer('pile_cycle').notNull(),
  status: stockpileLotStatusEnum('status').notNull().default('ACTIVE'),
  reclaimedAt: timestamp('reclaimed_at', { withTimezone: true }),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('stockpile_lots_business_uq').on(t.layoutId, t.lotNo, t.pileCycle),
  index('stockpile_lots_layout_status_idx').on(t.layoutId, t.status, t.updatedAt),
  index('stockpile_lots_logical_pile_idx').on(t.logicalPileId),
  index('stockpile_lots_created_by_idx').on(t.createdBy),
  index('stockpile_lots_updated_by_idx').on(t.updatedBy),
  check('stockpile_lots_cycle_check', sql`${t.pileCycle} > 0 AND length(trim(${t.lotNo})) > 0`),
]);

export const stockpileLayers = pgTable('stockpile_layers', {
  id: uuid('id').primaryKey().defaultRandom(),
  lotId: uuid('lot_id').notNull().references(() => stockpileLots.id, { onDelete: 'cascade' }),
  label: text('label'),
  startPosition: numeric('start_position', { precision: 12, scale: 4 }).notNull(),
  endPosition: numeric('end_position', { precision: 12, scale: 4 }).notNull(),
  bottomLevel: numeric('bottom_level', { precision: 12, scale: 4 }).notNull(),
  topLevel: numeric('top_level', { precision: 12, scale: 4 }).notNull(),
  version: integer('version').notNull().default(1),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('stockpile_layers_lot_idx').on(t.lotId),
  index('stockpile_layers_created_by_idx').on(t.createdBy),
  index('stockpile_layers_updated_by_idx').on(t.updatedBy),
  check('stockpile_layers_geometry_check', sql`${t.startPosition} >= 0 AND ${t.endPosition} > ${t.startPosition} AND ${t.bottomLevel} >= 0 AND ${t.topLevel} > ${t.bottomLevel} AND ${t.version} > 0`),
]);

export const stockpileLayerMixes = pgTable('stockpile_layer_mixes', {
  id: uuid('id').primaryKey().defaultRandom(),
  layerId: uuid('layer_id').notNull().references(() => stockpileLayers.id, { onDelete: 'cascade' }),
  mixId: uuid('mix_id').notNull().references(() => mixes.id, { onDelete: 'restrict' }),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('stockpile_layer_mixes_layer_mix_uq').on(t.layerId, t.mixId),
  uniqueIndex('stockpile_layer_mixes_mix_uq').on(t.mixId),
]);

export const reclaimerPositionEvents = pgTable('reclaimer_position_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  layoutId: uuid('layout_id').notNull().references(() => warehouseLayouts.id, { onDelete: 'restrict' }),
  position: numeric('position', { precision: 12, scale: 4 }).notNull(),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
  reason: text('reason'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('reclaimer_position_layout_effective_idx').on(t.layoutId, t.effectiveAt, t.createdAt),
  index('reclaimer_position_created_by_idx').on(t.createdBy),
  check('reclaimer_position_nonnegative_check', sql`${t.position} >= 0`),
]);
