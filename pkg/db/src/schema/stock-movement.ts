import type { StockMovementReason, StockMovementType } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { jobs } from './job.js';
import { parts } from './part.js';
import { purchaseOrderLines } from './purchase-order.js';
import { stocktakeSessions } from './stocktake.js';

/**
 * One production event: N units of a Built Part came off the rack, consuming its components. Its
 * movements carry the value across (spec §6), so the header is insert-only like the ledger itself —
 * there is no planned-build entity to amend, you record the build you actually did.
 */
export const stockBuilds = pgTable(
  'stock_build',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    builtPartId: uuid('built_part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    quantity: numeric('quantity', { mode: 'number', precision: 14, scale: 3 }).notNull(),
  },
  (table) => [check('stock_build_quantity_positive', sql`${table.quantity} > 0`)],
);

export const stockBuildRelations = relations(stockBuilds, ({ one }) => ({
  actor: one(user, {
    fields: [stockBuilds.actorUserId],
    references: [user.id],
  }),
  builtPart: one(parts, {
    fields: [stockBuilds.builtPartId],
    references: [parts.id],
  }),
}));

export const stockMovements = pgTable(
  'stock_movement',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    // Both halves of a build point at the one event that produced them.
    buildId: uuid('build_id').references(() => stockBuilds.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    delta: numeric('delta', { mode: 'number', precision: 14, scale: 3 }).notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'restrict' }),
    lengthMm: integer('length_mm'),
    // Later inventory tickets extend this closed set as they ship their corresponding write paths.
    movementType: text('movement_type').notNull().$type<StockMovementType>(),
    note: text('note'),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    // A receipt — and the return that sends it back — attaches to exactly one PO line through the
    // line's own composite key.
    purchaseOrderId: uuid('purchase_order_id'),
    // One widened column carrying two closed sets; each movement type's shape branch below pins the
    // subset it may use, so an adjustment can never claim `defective` nor a return `scrap`.
    reason: text('reason').$type<StockMovementReason>(),
    // The session a count was walked in, when it was walked in one. Ad-hoc counts outside a session
    // were always legal and stay so, which is why this is nullable rather than a second table.
    //
    // It is also the one thing that excuses an adjustment from the mandatory note (see the shape
    // check below): the note exists so an adjustment explains itself, and naming the walk it was
    // made on says strictly more than a line of free text would. An ad-hoc count still needs one.
    stocktakeSessionId: uuid('stocktake_session_id').references(() => stocktakeSessions.id, { onDelete: 'restrict' }),
    unitCost: numeric('unit_cost', { mode: 'number', precision: 18, scale: 6 }),
  },
  (table) => [
    check('stock_movement_length_mm_positive', sql`${table.lengthMm} IS NULL OR ${table.lengthMm} > 0`),
    check(
      'stock_movement_type_check',
      sql`${table.movementType} IN ('adjustment', 'revaluation', 'checkout', 'return-to-store', 'receipt', 'return-to-supplier', 'build-consume', 'build-produce')`,
    ),
    check(
      'stock_movement_reason_check',
      sql`${table.reason} IS NULL OR ${table.reason} IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction', 'wrong-item', 'defective', 'order-error')`,
    ),
    check('stock_movement_note_nonempty', sql`${table.note} IS NULL OR length(trim(${table.note})) > 0`),
    check('stock_movement_unit_cost_nonnegative', sql`${table.unitCost} IS NULL OR ${table.unitCost} >= 0`),
    check(
      'stock_movement_shape',
      sql`(
        ${table.movementType} = 'adjustment'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NULL
        AND ${table.reason} IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')
        AND (${table.stocktakeSessionId} IS NULL OR ${table.reason} = 'stock-count')
        AND (
          ${table.reason} = 'opening-balance'
          OR ${table.stocktakeSessionId} IS NOT NULL
          OR ${table.note} IS NOT NULL
        )
        AND (${table.unitCost} IS NULL OR ${table.reason} = 'opening-balance')
      ) OR (
        ${table.movementType} = 'revaluation'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} = 0
        AND ${table.unitCost} IS NOT NULL
        AND ${table.reason} IS NULL
      ) OR (
        ${table.movementType} = 'checkout'
        AND ${table.jobId} IS NOT NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} < 0
        AND ${table.reason} IS NULL
      ) OR (
        ${table.movementType} = 'return-to-store'
        AND ${table.jobId} IS NOT NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} > 0
        AND ${table.reason} IS NULL
      ) OR (
        ${table.movementType} = 'receipt'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NOT NULL
        AND ${table.buildId} IS NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} > 0
        AND ${table.reason} IS NULL
        AND ${table.unitCost} IS NOT NULL
      ) OR (
        ${table.movementType} = 'return-to-supplier'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NOT NULL
        AND ${table.buildId} IS NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} < 0
        AND ${table.reason} IN ('wrong-item', 'defective', 'order-error')
      ) OR (
        ${table.movementType} = 'build-consume'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NOT NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} < 0
        AND ${table.reason} IS NULL
      ) OR (
        ${table.movementType} = 'build-produce'
        AND ${table.jobId} IS NULL
        AND ${table.purchaseOrderId} IS NULL
        AND ${table.buildId} IS NOT NULL
        AND ${table.stocktakeSessionId} IS NULL
        AND ${table.delta} > 0
        AND ${table.reason} IS NULL
      )`,
    ),
    foreignKey({
      columns: [table.purchaseOrderId, table.partId],
      foreignColumns: [purchaseOrderLines.purchaseOrderId, purchaseOrderLines.partId],
      name: 'stock_movement_purchase_order_line_fk',
    }).onDelete('restrict'),
    index('stock_movement_job_part_created_idx').on(table.jobId, table.partId, table.createdAt, table.id),
    index('stock_movement_purchase_order_part_idx').on(table.purchaseOrderId, table.partId),
    index('stock_movement_part_created_idx').on(table.partId, table.createdAt, table.id),
    index('stock_movement_build_idx').on(table.buildId),
    index('stock_movement_stocktake_session_idx').on(table.stocktakeSessionId, table.partId),
  ],
);

export const stockMovementRelations = relations(stockMovements, ({ one }) => ({
  actor: one(user, {
    fields: [stockMovements.actorUserId],
    references: [user.id],
  }),
  job: one(jobs, {
    fields: [stockMovements.jobId],
    references: [jobs.id],
  }),
  part: one(parts, {
    fields: [stockMovements.partId],
    references: [parts.id],
  }),
  stocktakeSession: one(stocktakeSessions, {
    fields: [stockMovements.stocktakeSessionId],
    references: [stocktakeSessions.id],
  }),
}));
