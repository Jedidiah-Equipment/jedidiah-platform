import { relations } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth.js';

// One row per user: the Changelog View high-water mark. `lastSeenReleaseAt` is the
// `releasedAt` of the newest Changelog the user has acknowledged; the mark only ever moves forward.
export const changelogView = pgTable('changelog_view', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  lastSeenReleaseAt: timestamp('last_seen_release_at', {
    mode: 'date',
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const changelogViewRelations = relations(changelogView, ({ one }) => ({
  user: one(user, { fields: [changelogView.userId], references: [user.id] }),
}));
