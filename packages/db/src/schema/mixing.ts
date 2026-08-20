import { date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { materialKindEnum, mixStatusEnum } from './enums';
import { users } from './iam';
import { piles, plants, shifts } from './master';
import { rawSamples } from './raw-sample';

export const mixes = pgTable('mixes', {
  id: uuid('id').primaryKey().defaultRandom(),
  mixCode: text('mix_code').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  operationDate: date('operation_date').notNull(),
  pileId: uuid('pile_id').notNull().references(() => piles.id, { onDelete: 'restrict' }),
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'restrict' }),
  classNameSnapshot: text('class_name_snapshot'),
  shiftCode: text('shift_code').notNull().references(() => shifts.code, { onDelete: 'restrict' }),
  locationRef: text('location_ref').notNull(),
  batchNo: integer('batch_no'),
  tiangKe: text('tiang_ke'),
  pileCycle: integer('pile_cycle').notNull().default(1),
  defaultTonPerRetase: numeric('default_ton_per_retase', { precision: 12, scale: 4 }).notNull(),
  status: mixStatusEnum('status').notNull().default('ACTIVE'),
  replacesMixId: uuid('replaces_mix_id'),
  note: text('note'),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('mixes_date_kind_idx').on(t.operationDate, t.materialKind),
  index('mixes_pile_cycle_idx').on(t.pileId, t.pileCycle, t.operationDate),
]);

export const mixItems = pgTable('mix_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  mixId: uuid('mix_id').notNull().references(() => mixes.id, { onDelete: 'cascade' }),
  sampleId: uuid('sample_id').notNull().references(() => rawSamples.id, { onDelete: 'restrict' }),
  retase: integer('retase').notNull(),
  tonPerRetase: numeric('ton_per_retase', { precision: 12, scale: 4 }).notNull(),
  tonnage: numeric('tonnage', { precision: 16, scale: 4 }).notNull(),
  chemistrySnapshot: jsonb('chemistry_snapshot').notNull(),
  sourceRetaseAllocationId: uuid('source_retase_allocation_id'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('mix_item_sample_uq').on(t.mixId, t.sampleId), index('mix_item_sample_idx').on(t.sampleId)]);

export const mixItemChemistryRevisions = pgTable('mix_item_chemistry_revisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  mixItemId: uuid('mix_item_id').notNull().references(() => mixItems.id, { onDelete: 'cascade' }),
  revisionNo: integer('revision_no').notNull(),
  beforeSnapshot: jsonb('before_snapshot').notNull(),
  afterSnapshot: jsonb('after_snapshot').notNull(),
  reason: text('reason').notNull(),
  changedBy: uuid('changed_by').notNull().references(() => users.id, { onDelete: 'restrict' }),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex('mix_item_revision_no_uq').on(t.mixItemId, t.revisionNo)]);
