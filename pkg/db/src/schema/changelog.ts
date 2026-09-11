import type { Business } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

// One row per user per business: the Changelog View high-water mark. `lastSeenReleaseAt` is the
// `releasedAt` of the newest Changelog of that business the user has acknowledged; the mark only ever
// moves forward. Business-blind mechanism in `public` (ADR 0016): every row is filterable by `business`.
export const changelogView = pgTable(
  'changelog_view',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    business: text('business').$type<Business>().notNull(),
    lastSeenReleaseAt: timestamp('last_seen_release_at', {
      mode: 'date',
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.business] }),
    check('changelog_view_business', sql`${table.business} IN ('equipment', 'contracting')`),
  ],
);

export const changelogViewRelations = relations(changelogView, ({ one }) => ({
  user: one(user, { fields: [changelogView.userId], references: [user.id] }),
}));
