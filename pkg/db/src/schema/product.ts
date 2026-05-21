import type { Department } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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

export const productDepartmentConfigs = pgTable(
  'product_department_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    department: text('department').notNull().$type<Department>(),
    durationDays: integer('duration_days').notNull().default(0),
    defaultStationIds: uuid('default_station_ids').array().notNull().default(sql`'{}'::uuid[]`),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_department_config_duration_days_nonnegative', sql`${table.durationDays} >= 0`),
    uniqueIndex('product_department_config_product_id_department_unique').on(table.productId, table.department),
  ],
);

export const productDepartmentConfigsRelations = relations(productDepartmentConfigs, ({ one }) => ({
  product: one(products, {
    fields: [productDepartmentConfigs.productId],
    references: [products.id],
  }),
}));
