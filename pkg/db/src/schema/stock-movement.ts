import type { StockAdjustmentReason, StockMovementType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { parts } from './part.js';

export const stockMovements = pgTable(
  'stock_movement',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    delta: numeric('delta', { mode: 'number', precision: 14, scale: 3 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    lengthMm: integer('length_mm'),
    // Later inventory tickets extend this closed set as they ship their corresponding write paths.
    movementType: text('movement_type').notNull().$type<StockMovementType>(),
    note: text('note'),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    reason: text('reason').$type<StockAdjustmentReason>(),
    unitCost: numeric('unit_cost', { mode: 'number', precision: 18, scale: 6 }),
  },
  (table) => [
    check('stock_movement_length_mm_positive', sql`${table.lengthMm} IS NULL OR ${table.lengthMm} > 0`),
    check('stock_movement_type_check', sql`${table.movementType} IN ('adjustment', 'revaluation')`),
    check(
      'stock_movement_reason_check',
      sql`${table.reason} IS NULL OR ${table.reason} IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')`,
    ),
    check('stock_movement_note_nonempty', sql`${table.note} IS NULL OR length(trim(${table.note})) > 0`),
    check('stock_movement_unit_cost_nonnegative', sql`${table.unitCost} IS NULL OR ${table.unitCost} >= 0`),
    check(
      'stock_movement_shape',
      sql`(
        ${table.movementType} = 'adjustment'
        AND ${table.reason} IS NOT NULL
        AND (${table.reason} = 'opening-balance' OR ${table.note} IS NOT NULL)
        AND (${table.unitCost} IS NULL OR ${table.reason} = 'opening-balance')
      ) OR (
        ${table.movementType} = 'revaluation'
        AND ${table.delta} = 0
        AND ${table.unitCost} IS NOT NULL
        AND ${table.reason} IS NULL
      )`,
    ),
    index('stock_movement_part_created_idx').on(table.partId, table.createdAt, table.id),
  ],
);

export const stockMovementRelations = relations(stockMovements, ({ one }) => ({
  actor: one(user, {
    fields: [stockMovements.actorUserId],
    references: [user.id],
  }),
  part: one(parts, {
    fields: [stockMovements.partId],
    references: [parts.id],
  }),
}));
