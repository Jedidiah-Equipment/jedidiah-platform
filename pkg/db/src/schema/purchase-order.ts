import type { PurchaseOrderStatus } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { jobs } from './job.js';
import { parts } from './part.js';
import { supplier } from './supplier.js';

export const purchaseOrderCodeSequence = pgSequence('purchase_order_code_seq');

export const purchaseOrders = pgTable(
  'purchase_order',
  {
    code: integer('code').notNull().default(sql`nextval('purchase_order_code_seq'::regclass)`),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    expectedDeliveryDate: date('expected_delivery_date', { mode: 'string' }),
    id: uuid('id').defaultRandom().primaryKey(),
    sentAt: timestamp('sent_at', { mode: 'date', withTimezone: true }),
    status: text('status').notNull().default('draft').$type<PurchaseOrderStatus>(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'restrict' }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('purchase_order_code_positive', sql`${table.code} > 0`),
    check('purchase_order_status_check', sql`${table.status} IN ('draft', 'sent', 'cancelled')`),
    check(
      'purchase_order_sent_at_shape',
      sql`(${table.status} = 'draft' AND ${table.sentAt} IS NULL) OR (${table.status} = 'sent' AND ${table.sentAt} IS NOT NULL) OR ${table.status} = 'cancelled'`,
    ),
    index('purchase_order_supplier_id_idx').on(table.supplierId),
    uniqueIndex('purchase_order_code_unique').on(table.code),
  ],
);

export const purchaseOrderLines = pgTable(
  'purchase_order_line',
  {
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { mode: 'number', precision: 14, scale: 3 }).notNull(),
    unitPrice: numeric('unit_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.purchaseOrderId, table.partId], name: 'purchase_order_line_pkey' }),
    check('purchase_order_line_quantity_positive', sql`${table.quantity} > 0`),
    check('purchase_order_line_unit_price_nonnegative', sql`${table.unitPrice} >= 0`),
  ],
);

export const purchaseOrderJobLinks = pgTable(
  'purchase_order_job_link',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'restrict' }),
    purchaseOrderId: uuid('purchase_order_id')
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.purchaseOrderId, table.jobId], name: 'purchase_order_job_link_pkey' }),
    index('purchase_order_job_link_job_id_idx').on(table.jobId),
  ],
);

export const purchaseOrderRelations = relations(purchaseOrders, ({ many, one }) => ({
  jobLinks: many(purchaseOrderJobLinks),
  lines: many(purchaseOrderLines),
  supplier: one(supplier, {
    fields: [purchaseOrders.supplierId],
    references: [supplier.id],
  }),
}));

export const purchaseOrderLineRelations = relations(purchaseOrderLines, ({ one }) => ({
  part: one(parts, {
    fields: [purchaseOrderLines.partId],
    references: [parts.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderLines.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));

export const purchaseOrderJobLinkRelations = relations(purchaseOrderJobLinks, ({ one }) => ({
  job: one(jobs, {
    fields: [purchaseOrderJobLinks.jobId],
    references: [jobs.id],
  }),
  purchaseOrder: one(purchaseOrders, {
    fields: [purchaseOrderJobLinks.purchaseOrderId],
    references: [purchaseOrders.id],
  }),
}));
