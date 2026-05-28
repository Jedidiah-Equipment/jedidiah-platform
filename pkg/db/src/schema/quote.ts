import type { QuoteStatus } from '@pkg/schema';
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
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    salesPersonId: text('sales_person_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft').$type<QuoteStatus>(),
    discount: numeric('discount', { mode: 'number', precision: 12, scale: 2 }).notNull().default(0),
    deliveryIncluded: boolean('delivery_included').notNull().default(true),
    deliveryPrice: numeric('delivery_price', { mode: 'number', precision: 12, scale: 2 }).notNull().default(0),
    validUntil: date('valid_until', { mode: 'string' }),
    preferredDeliveryDate: date('preferred_delivery_date', { mode: 'string' }),
    plannedDeliveryDate: date('planned_delivery_date', { mode: 'string' }),
    notes: text('notes'),
    paymentTerms: text('payment_terms'),
    quotedBasePrice: numeric('quoted_base_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    quotedCurrencyCode: text('quoted_currency_code').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('quote_discount_nonnegative', sql`${table.discount} >= 0`),
    check('quote_discount_not_above_snapshot', sql`${table.discount} <= ${table.quotedBasePrice}`),
    check('quote_delivery_price_nonnegative', sql`${table.deliveryPrice} >= 0`),
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
  selectedAssemblies: many(quoteSelectedAssemblies),
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
