import { boolean, date, index, integer, numeric, pgTable, text, time, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { equipmentTypeEnum, materialKindEnum, tonPerRetaseRuleTypeEnum } from './enums';
import { users, vendors } from './iam';


export const vendorAliases = pgTable('vendor_aliases', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  alias: text('alias').notNull(),
  normalizedAlias: text('normalized_alias').notNull(),
}, (t) => [uniqueIndex('vendor_aliases_normalized_uq').on(t.normalizedAlias), index('vendor_aliases_vendor_idx').on(t.vendorId)]);

export const plants = pgTable('plants', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('plants_code_uq').on(t.code), index('plants_active_idx').on(t.active)]);

export const crushers = pgTable('crushers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'restrict' }),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('crushers_code_uq').on(t.code), index('crushers_kind_idx').on(t.materialKind), index('crushers_active_idx').on(t.active)]);

export const userCrusherScopes = pgTable('user_crusher_scopes', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  crusherId: uuid('crusher_id').notNull().references(() => crushers.id, { onDelete: 'cascade' }),
}, (t) => [uniqueIndex('user_crusher_scope_uq').on(t.userId, t.crusherId)]);

export const equipment = pgTable('equipment', {
  id: uuid('id').primaryKey().defaultRandom(),
  vendorId: uuid('vendor_id').notNull().references(() => vendors.id, { onDelete: 'restrict' }),
  type: equipmentTypeEnum('type').notNull(),
  unitNo: text('unit_no').notNull(),
  brand: text('brand'),
  model: text('model'),
  aliases: text('aliases').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('equipment_vendor_type_unit_uq').on(t.vendorId, t.type, t.unitNo), index('equipment_vendor_idx').on(t.vendorId), index('equipment_active_idx').on(t.active)]);

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  block: text('block'),
  materialCategory: text('material_category').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  aliases: text('aliases').array().notNull().default([]),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('sources_code_uq').on(t.code), index('sources_kind_idx').on(t.materialKind), index('sources_active_idx').on(t.active)]);

export const piles = pgTable('piles', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'restrict' }),
  className: text('class_name'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('piles_code_uq').on(t.code), index('piles_active_idx').on(t.active)]);

export const shifts = pgTable('shifts', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  crossesMidnight: boolean('crosses_midnight').notNull().default(false),
  active: boolean('active').notNull().default(true),
});

export const qualityTargets = pgTable('quality_targets', {
  id: uuid('id').primaryKey().defaultRandom(),
  materialKind: materialKindEnum('material_kind').notNull(),
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'restrict' }),
  className: text('class_name'),
  lsfMin: numeric('lsf_min', { precision: 12, scale: 4 }), lsfMax: numeric('lsf_max', { precision: 12, scale: 4 }),
  smMin: numeric('sm_min', { precision: 12, scale: 4 }), smMax: numeric('sm_max', { precision: 12, scale: 4 }),
  amMin: numeric('am_min', { precision: 12, scale: 4 }), amMax: numeric('am_max', { precision: 12, scale: 4 }),
  naeqMax: numeric('naeq_max', { precision: 12, scale: 4 }), r2o3Max: numeric('r2o3_max', { precision: 12, scale: 4 }),
  priority: integer('priority').notNull().default(100), effectiveFrom: date('effective_from'), effectiveTo: date('effective_to'),
  active: boolean('active').notNull().default(true),
}, (t) => [index('quality_target_lookup_idx').on(t.materialKind, t.plantId, t.className, t.active)]);

export const tonPerRetaseRules = pgTable('ton_per_retase_rules', {
  id: uuid('id').primaryKey().defaultRandom(),
  materialKind: materialKindEnum('material_kind').notNull(),
  ruleType: tonPerRetaseRuleTypeEnum('rule_type').notNull(),
  matchKey: text('match_key'),
  normalizedMatchKey: text('normalized_match_key'),
  rate: numeric('rate', { precision: 12, scale: 4 }).notNull(),
  priority: integer('priority').notNull().default(100),
  effectiveFrom: date('effective_from'), effectiveTo: date('effective_to'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('ton_per_retase_lookup_idx').on(t.materialKind, t.active, t.priority)]);
