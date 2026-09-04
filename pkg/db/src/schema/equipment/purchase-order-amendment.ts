import type { PurchaseOrderAmendmentKind } from '@pkg/schema/equipment';
import { relations, sql } from 'drizzle-orm';
import { check, date, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { parts } from './part.js';
import { equipmentSchema } from './pg-schema.js';
import { purchaseOrders } from './purchase-order.js';

/**
 * The log of what changed on an order after it was sent (spec §4). Insert-only like the stock
 * ledger and for the same reason: the phone call that moved a quantity is a fact, and the order's
 * lines — which the amendment rewrites in the same transaction — only ever show where it ended up.
 *
 * Drafts never reach this table; they stay freely editable through the draft save, so an empty log
 * is exactly what "this order has not changed since it went out" looks like.
 */
export const purchaseOrderAmendments = equipmentSchema.table(
  'purchase_order_amendment',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind').notNull().$type<PurchaseOrderAmendmentKind>(),
    /** What took the line's place; only a substitution has one. */
    newPartId: uuid('new_part_id').references(() => parts.id, { onDelete: 'restrict' }),
    newExpectedDate: date('new_expected_date', { mode: 'string' }),
    newQuantity: numeric('new_quantity', { mode: 'number', precision: 14, scale: 3 }),
    note: text('note').notNull(),
    /** Null for an added line and for a date amendment, neither of which moved an earlier quantity. */
    oldQuantity: numeric('old_quantity', { mode: 'number', precision: 14, scale: 3 }),
    oldExpectedDate: date('old_expected_date', { mode: 'string' }),
    partId: uuid('part_id').references(() => parts.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  },
  (table) => [
    check(
      'purchase_order_amendment_kind_check',
      sql`${table.kind} IN ('quantity-change', 'add-line', 'substitute-part', 'expected-date-change')`,
    ),
    check('purchase_order_amendment_note_nonempty', sql`length(trim(${table.note})) > 0`),
    check('purchase_order_amendment_new_quantity_positive', sql`${table.newQuantity} > 0`),
    check(
      'purchase_order_amendment_old_quantity_positive',
      sql`${table.oldQuantity} IS NULL OR ${table.oldQuantity} > 0`,
    ),
    // One branch per kind, the same way the ledger pins each movement type's shape.
    check(
      'purchase_order_amendment_shape',
      sql`(
        ${table.kind} = 'quantity-change'
        AND ${table.partId} IS NOT NULL
        AND ${table.newPartId} IS NULL
        AND ${table.newQuantity} IS NOT NULL
        AND ${table.oldQuantity} IS NOT NULL
        AND ${table.oldExpectedDate} IS NULL
        AND ${table.newExpectedDate} IS NULL
      ) OR (
        ${table.kind} = 'add-line'
        AND ${table.partId} IS NOT NULL
        AND ${table.newPartId} IS NULL
        AND ${table.newQuantity} IS NOT NULL
        AND ${table.oldQuantity} IS NULL
        AND ${table.oldExpectedDate} IS NULL
        AND ${table.newExpectedDate} IS NULL
      ) OR (
        ${table.kind} = 'substitute-part'
        AND ${table.partId} IS NOT NULL
        AND ${table.newPartId} IS NOT NULL
        AND ${table.newPartId} <> ${table.partId}
        AND ${table.newQuantity} IS NOT NULL
        AND ${table.oldQuantity} IS NOT NULL
        AND ${table.oldExpectedDate} IS NULL
        AND ${table.newExpectedDate} IS NULL
      ) OR (
        ${table.kind} = 'expected-date-change'
        AND ${table.partId} IS NULL
        AND ${table.newPartId} IS NULL
        AND ${table.newQuantity} IS NULL
        AND ${table.oldQuantity} IS NULL
        AND ${table.newExpectedDate} IS NOT NULL
      )`,
    ),
    index('purchase_order_amendment_purchase_order_idx').on(table.purchaseOrderId, table.createdAt, table.id),
  ],
);

export const purchaseOrderAmendmentRelations = relations(purchaseOrderAmendments, ({ one }) => ({
  actor: one(user, {
    fields: [purchaseOrderAmendments.actorUserId],
    references: [user.id],
  }),
  newPart: one(parts, {
    fields: [purchaseOrderAmendments.newPartId],
    relationName: 'amendmentNewPart',
    references: [parts.id],
  }),
  part: one(parts, {
    fields: [purchaseOrderAmendments.partId],
    relationName: 'amendmentPart',
    references: [parts.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderAmendments.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));
