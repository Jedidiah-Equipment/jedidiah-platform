import { sql } from 'drizzle-orm';
import { check, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const products = pgTable(
  'products',
  {
    basePrice: numeric('base_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    currencyCode: text('currency_code').notNull().default('ZAR'),
    description: text('description'),
    id: uuid('id').defaultRandom().primaryKey(),
    modelCode: text('model_code').notNull(),
    name: text('name').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('products_base_price_nonnegative', sql`${table.basePrice} >= 0`),
    uniqueIndex('products_model_code_unique').on(table.modelCode),
    uniqueIndex('products_name_unique').on(table.name),
  ],
);
