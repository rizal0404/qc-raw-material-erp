import { date, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { materialKindEnum } from './enums';
import { vendors } from './iam';
import { plants, sources } from './master';

export const rawSamples = pgTable('raw_samples', {
  id: uuid('id').primaryKey().defaultRandom(),
  sampleId: text('sample_id').notNull(),
  materialKind: materialKindEnum('material_kind').notNull(),
  operationDate: date('sample_date').notNull(),
  noSample: text('no_sample'),
  sourceShift: text('source_shift'),
  typeGrade: text('type_grade'),
  vendorId: uuid('vendor_id').references(() => vendors.id, { onDelete: 'restrict' }),
  vendorSnapshot: text('vendor_snapshot'),
  sourceId: uuid('source_id').references(() => sources.id, { onDelete: 'restrict' }),
  sourceSnapshot: text('source_snapshot'),
  plantId: uuid('plant_id').references(() => plants.id, { onDelete: 'restrict' }),
  loaderUnitNo: text('loader_unit_no'),
  block: text('block'),
  direction: text('direction'),
  sio2: numeric('sio2', { precision: 12, scale: 5 }), al2o3: numeric('al2o3', { precision: 12, scale: 5 }), fe2o3: numeric('fe2o3', { precision: 12, scale: 5 }),
  cao: numeric('cao', { precision: 12, scale: 5 }), mgo: numeric('mgo', { precision: 12, scale: 5 }), k2o: numeric('k2o', { precision: 12, scale: 5 }),
  na2o: numeric('na2o', { precision: 12, scale: 5 }), so3: numeric('so3', { precision: 12, scale: 5 }), h2o: numeric('h2o', { precision: 12, scale: 5 }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('raw_samples_sample_id_uq').on(t.sampleId),
  index('raw_samples_date_kind_idx').on(t.operationDate, t.materialKind),
  index('raw_samples_vendor_date_idx').on(t.vendorId, t.operationDate),
  index('raw_samples_source_date_idx').on(t.sourceId, t.operationDate),
]);
