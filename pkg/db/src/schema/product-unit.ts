import { relations, sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { customers } from './customer.js';
import { jobs } from './job.js';
import { products } from './product.js';
import { quotes } from './quote.js';

export const productUnits = pgTable(
  'product_unit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    productSerialPrefix: text('product_serial_prefix').notNull(),
    productSerialYear: integer('product_serial_year').notNull(),
    productSerialSequence: integer('product_serial_sequence').notNull(),
    productSerialNumber: text('product_serial_number').notNull(),
    vinNumber: text('vin_number'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_unit_serial_prefix_nonempty', sql`length(trim(${table.productSerialPrefix})) > 0`),
    check('product_unit_serial_year_range', sql`${table.productSerialYear} >= 0 AND ${table.productSerialYear} <= 99`),
    check('product_unit_serial_sequence_positive', sql`${table.productSerialSequence} > 0`),
    check('product_unit_serial_number_nonempty', sql`length(trim(${table.productSerialNumber})) > 0`),
    check('product_unit_vin_number_nonempty', sql`${table.vinNumber} IS NULL OR length(trim(${table.vinNumber})) > 0`),
    uniqueIndex('product_unit_serial_number_unique').on(table.productSerialNumber),
  ],
);

export const productUnitOwnershipTransfers = pgTable(
  'product_unit_ownership_transfer',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productUnitId: uuid('product_unit_id')
      .notNull()
      .references(() => productUnits.id, { onDelete: 'cascade' }),
    // Null on either side means we hold the machine: null -> customer is a sale out of Stock, and
    // customer -> null is a return to Stock.
    fromCustomerId: uuid('from_customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    toCustomerId: uuid('to_customer_id').references(() => customers.id, { onDelete: 'restrict' }),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    sourceQuoteId: uuid('source_quote_id').references(() => quotes.id, { onDelete: 'set null' }),
    // Null actor means the system wrote the row (backfill), matching the audit log's system convention.
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    note: text('note'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'product_unit_ownership_transfer_moves_owner',
      sql`${table.fromCustomerId} IS DISTINCT FROM ${table.toCustomerId}`,
    ),
    check(
      'product_unit_ownership_transfer_note_nonempty',
      sql`${table.note} IS NULL OR length(trim(${table.note})) > 0`,
    ),
    // Current Owner is the newest row per Unit, so reads land on (unit, occurredOn desc, createdAt desc).
    index('product_unit_ownership_transfer_unit_recency_idx').on(
      table.productUnitId,
      table.occurredOn,
      table.createdAt,
    ),
  ],
);

export const productUnitsRelations = relations(productUnits, ({ many, one }) => ({
  jobs: many(jobs),
  ownershipTransfers: many(productUnitOwnershipTransfers),
  product: one(products, {
    fields: [productUnits.productId],
    references: [products.id],
  }),
}));

export const productUnitOwnershipTransfersRelations = relations(productUnitOwnershipTransfers, ({ one }) => ({
  actor: one(user, {
    fields: [productUnitOwnershipTransfers.actorUserId],
    references: [user.id],
  }),
  fromCustomer: one(customers, {
    fields: [productUnitOwnershipTransfers.fromCustomerId],
    references: [customers.id],
    relationName: 'ownershipTransferFromCustomer',
  }),
  productUnit: one(productUnits, {
    fields: [productUnitOwnershipTransfers.productUnitId],
    references: [productUnits.id],
  }),
  sourceQuote: one(quotes, {
    fields: [productUnitOwnershipTransfers.sourceQuoteId],
    references: [quotes.id],
  }),
  toCustomer: one(customers, {
    fields: [productUnitOwnershipTransfers.toCustomerId],
    references: [customers.id],
    relationName: 'ownershipTransferToCustomer',
  }),
}));
