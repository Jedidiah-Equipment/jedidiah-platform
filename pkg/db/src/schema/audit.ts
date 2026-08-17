import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action').notNull(),
    summary: text('summary').notNull(),
    changes: jsonb('changes'),
  },
  (table) => [
    index('audit_entity_idx').on(table.entityType, table.entityId, table.occurredAt),
    index('audit_actor_idx').on(table.actorUserId, table.occurredAt),
    // The Job Activity feed asks for every event of a kind by time, which `audit_entity_idx` cannot
    // serve: it leads with the entity, and the feed names none.
    index('audit_type_action_occurred_idx').on(table.entityType, table.action, table.occurredAt),
  ],
);
