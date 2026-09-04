import type { StocktakeScope } from '@pkg/schema/equipment';
import { relations, sql } from 'drizzle-orm';
import { check, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { equipmentSchema } from './pg-schema.js';

/**
 * One walk of a standing counting rhythm: opened with a scope, counted item by item, closed once
 * (spec §9).
 *
 * There is no status column and no update path beyond the close, because the session is not the
 * record — the `stock-count` movements pointing at it are. Everything a session is asked about
 * (what has been counted, what has been skipped, what the variance came to) is a query over those
 * movements, so a stored roll-up here could only ever disagree with the ledger.
 *
 * At most one session per scope may be open at a time: the two rhythms are shop-wide walks, and a
 * second open walk would split one scope's uncounted list across two to-dos nobody reconciles.
 */
export const stocktakeSessions = equipmentSchema.table(
  'stocktake_session',
  {
    closedAt: timestamp('closed_at', { mode: 'date', withTimezone: true }),
    closedByUserId: text('closed_by_user_id').references(() => user.id, { onDelete: 'restrict' }),
    id: uuid('id').defaultRandom().primaryKey(),
    openedAt: timestamp('opened_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    openedByUserId: text('opened_by_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    scope: text('scope').notNull().$type<StocktakeScope>(),
  },
  (table) => [
    check('stocktake_session_scope_check', sql`${table.scope} IN ('raw-material', 'stores')`),
    // Closing is one act: the moment and the person who owns it arrive together or not at all.
    check('stocktake_session_closed_shape', sql`(${table.closedAt} IS NULL) = (${table.closedByUserId} IS NULL)`),
    uniqueIndex('stocktake_session_open_scope_idx').on(table.scope).where(sql`${table.closedAt} IS NULL`),
  ],
);

export const stocktakeSessionRelations = relations(stocktakeSessions, ({ one }) => ({
  closedBy: one(user, {
    fields: [stocktakeSessions.closedByUserId],
    references: [user.id],
  }),
  openedBy: one(user, {
    fields: [stocktakeSessions.openedByUserId],
    references: [user.id],
  }),
}));
