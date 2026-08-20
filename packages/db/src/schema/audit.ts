import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './iam';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventTs: timestamp('event_ts', { withTimezone: true }).notNull().defaultNow(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  actorRoleSnapshot: text('actor_role_snapshot'),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  reason: text('reason'),
  requestId: text('request_id'),
}, (t) => [index('audit_entity_idx').on(t.entityType, t.entityId, t.eventTs), index('audit_actor_idx').on(t.actorUserId, t.eventTs)]);
