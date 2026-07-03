import type { QuoteKind, QuoteStatus } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  integer,
  numeric,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { customers } from './customer.js';
import { jobs } from './job.js';
import { productAssemblies, products } from './product.js';

export const quoteCodeSequence = pgSequence('quote_code_seq');

export const quotes = pgTable(
  'quote',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: integer('code').notNull().default(sql`nextval('quote_code_seq'::regclass)`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull().default('product').$type<QuoteKind>(),
    workTitle: text('work_title'),
    productId: uuid('product_id').references(() => products.id, { onDelete: 'restrict' }),
    salesPersonId: text('sales_person_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft').$type<QuoteStatus>(),
    statusChangedAt: timestamp('status_changed_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    discountPercent: numeric('discount_percent', { mode: 'number', precision: 5, scale: 2 }).notNull().default(0),
    depositPercent: numeric('deposit_percent', { mode: 'number', precision: 5, scale: 2 }).notNull().default(0),
    deliveryIncluded: boolean('delivery_included').notNull().default(true),
    deliveryPrice: numeric('delivery_price', { mode: 'number', precision: 12, scale: 2 }).notNull().default(0),
    validUntil: date('valid_until', { mode: 'string' }),
    preferredDeliveryDate: date('preferred_delivery_date', { mode: 'string' }),
    plannedDeliveryDate: date('planned_delivery_date', { mode: 'string' }),
    notes: text('notes'),
    documentNotes: text('document_notes'),
    quotedBasePrice: numeric('quoted_base_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    quotedCurrencyCode: text('quoted_currency_code').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('quote_discount_percent_nonnegative', sql`${table.discountPercent} >= 0`),
    check('quote_discount_percent_not_above_100', sql`${table.discountPercent} <= 100`),
    check('quote_deposit_percent_nonnegative', sql`${table.depositPercent} >= 0`),
    check('quote_deposit_percent_not_above_100', sql`${table.depositPercent} <= 100`),
    check('quote_delivery_price_nonnegative', sql`${table.deliveryPrice} >= 0`),
    check(
      'quote_kind_shape',
      sql`(
        ${table.kind} = 'product' and ${table.productId} is not null and ${table.workTitle} is null
      ) or (
        ${table.kind} = 'custom' and ${table.productId} is null and ${table.workTitle} is not null and length(trim(${table.workTitle})) > 0
      )`,
    ),
    uniqueIndex('quote_code_unique').on(table.code),
  ],
);

export const quoteSelectedAssemblies = pgTable(
  'quote_selected_assemblies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    productAssemblyId: uuid('product_assembly_id').references(() => productAssemblies.id, { onDelete: 'set null' }),
    quotedName: text('quoted_name').notNull(),
    quotedPrice: numeric('quoted_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('quote_selected_assemblies_name_nonempty', sql`length(trim(${table.quotedName})) > 0`),
    check('quote_selected_assemblies_price_nonnegative', sql`${table.quotedPrice} >= 0`),
    uniqueIndex('quote_selected_assemblies_quote_product_assembly_unique').on(table.quoteId, table.productAssemblyId),
  ],
);

export const quoteLineItems = pgTable(
  'quote_line_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    quantity: integer('quantity').notNull().default(1),
    unitPrice: numeric('unit_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('quote_line_items_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check('quote_line_items_position_nonnegative', sql`${table.position} >= 0`),
    check('quote_line_items_quantity_positive', sql`${table.quantity} >= 1`),
    check('quote_line_items_unit_price_nonnegative', sql`${table.unitPrice} >= 0`),
  ],
);

export const quotesRelations = relations(quotes, ({ many, one }) => ({
  customer: one(customers, {
    fields: [quotes.customerId],
    references: [customers.id],
  }),
  jobs: many(jobs),
  product: one(products, {
    fields: [quotes.productId],
    references: [products.id],
  }),
  salesPerson: one(user, {
    fields: [quotes.salesPersonId],
    references: [user.id],
  }),
  lineItems: many(quoteLineItems),
  selectedAssemblies: many(quoteSelectedAssemblies),
}));

export const quoteLineItemsRelations = relations(quoteLineItems, ({ one }) => ({
  quote: one(quotes, {
    fields: [quoteLineItems.quoteId],
    references: [quotes.id],
  }),
}));

export const quoteSelectedAssembliesRelations = relations(quoteSelectedAssemblies, ({ one }) => ({
  productAssembly: one(productAssemblies, {
    fields: [quoteSelectedAssemblies.productAssemblyId],
    references: [productAssemblies.id],
  }),
  quote: one(quotes, {
    fields: [quoteSelectedAssemblies.quoteId],
    references: [quotes.id],
  }),
}));
