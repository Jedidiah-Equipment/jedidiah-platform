import { relations, sql } from 'drizzle-orm';
import { check, index, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from '../auth.js';
import { equipmentSchema } from './pg-schema.js';
import { purchaseOrderLines, purchaseOrders } from './purchase-order.js';

/** A Custom Line's append-only arrival history, separate from the stock ledger. */
export const purchaseOrderLineArrivals = equipmentSchema.table(
  'purchase_order_line_arrival',
  {
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    lineId: uuid('line_id')
      .notNull()
      .references(() => purchaseOrderLines.id, { onDelete: 'restrict' }),
    note: text('note'),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { mode: 'number', precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    check('purchase_order_line_arrival_quantity_nonzero', sql`${table.quantity} <> 0`),
    check(
      'purchase_order_line_arrival_reversal_note',
      sql`${table.quantity} > 0 OR length(trim(coalesce(${table.note}, ''))) > 0`,
    ),
    index('purchase_order_line_arrival_order_line_idx').on(table.purchaseOrderId, table.lineId),
  ],
);

export const purchaseOrderLineArrivalRelations = relations(purchaseOrderLineArrivals, ({ one }) => ({
  actor: one(user, { fields: [purchaseOrderLineArrivals.actorUserId], references: [user.id] }),
  line: one(purchaseOrderLines, { fields: [purchaseOrderLineArrivals.lineId], references: [purchaseOrderLines.id] }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderLineArrivals.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));
