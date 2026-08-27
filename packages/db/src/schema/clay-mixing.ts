import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { mixItems } from './mixing';
import { clayReportColumns } from './clay-report';

export const mixItemClayRetaseSources = pgTable('mix_item_clay_retase_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  mixItemId: uuid('mix_item_id').notNull().references(() => mixItems.id, { onDelete: 'restrict' }),
  columnId: uuid('column_id').notNull().references(() => clayReportColumns.id, { onDelete: 'restrict' }),
  retaseConsumed: integer('retase_consumed').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedReason: text('released_reason'),
}, t => [
  unique('mix_item_clay_retase_sources_mix_item_id_column_id_key').on(t.mixItemId,t.columnId),
  index('mix_item_clay_source_column_idx').on(t.columnId),
  check('mix_item_clay_retase_sources_retase_consumed_check',sql`${t.retaseConsumed}>0`),
  check('clay_consumption_release_ck',sql`(${t.active} AND ${t.releasedAt} IS NULL AND ${t.releasedReason} IS NULL) OR (NOT ${t.active} AND ${t.releasedAt} IS NOT NULL AND length(trim(coalesce(${t.releasedReason},'')))>0)`),
]);
