import { pushPlatforms } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

// One row per installed app that may receive pushes, keyed by its Expo token and re-pointed to whoever
// signed in last on that phone. Business-blind mechanism in `public` (ADR 0016): who is pinged, and why,
// is each business's own decision.
export const pushTokens = pgTable(
  'push_token',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    platform: text('platform', { enum: pushPlatforms }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('push_token_token_unique').on(table.token),
    index('push_token_user_idx').on(table.userId),
    check('push_token_platform', sql`${table.platform} IN ('ios', 'android')`),
  ],
);

export const pushTokenRelations = relations(pushTokens, ({ one }) => ({
  user: one(user, { fields: [pushTokens.userId], references: [user.id] }),
}));
