import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { mixItems } from './mixing';
import { qcRetaseAllocations, retaseEvents } from './retase';

export const qcRetaseAllocationEvents = pgTable('qc_retase_allocation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  allocationId: uuid('allocation_id').notNull().references(() => qcRetaseAllocations.id, { onDelete: 'restrict' }),
  eventId: uuid('event_id').notNull().references(() => retaseEvents.id, { onDelete: 'restrict' }),
  mixItemId: uuid('mix_item_id').references(() => mixItems.id, { onDelete: 'restrict' }),
  active: boolean('active').notNull().default(true),
  boundAt: timestamp('bound_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedReason: text('released_reason'),
}, (t) => [
  uniqueIndex('qc_alloc_event_active_once_uq').on(t.eventId).where(sql`${t.active} = true`),
  index('qc_alloc_event_allocation_idx').on(t.allocationId),
  index('qc_alloc_event_mix_item_idx').on(t.mixItemId),
]);

export const mixItemRetaseAllocations = pgTable('mix_item_retase_allocations', {
  id: uuid('id').primaryKey().defaultRandom(),
  mixItemId: uuid('mix_item_id').notNull().references(() => mixItems.id, { onDelete: 'cascade' }),
  allocationId: uuid('allocation_id').notNull().references(() => qcRetaseAllocations.id, { onDelete: 'restrict' }),
  retaseConsumed: integer('retase_consumed').notNull(),
  overrideReason: text('override_reason'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  releasedReason: text('released_reason'),
}, (t) => [
  uniqueIndex('mix_item_allocation_active_once_uq').on(t.allocationId).where(sql`${t.active} = true`),
  index('mix_item_allocation_mix_idx').on(t.mixItemId),
]);
