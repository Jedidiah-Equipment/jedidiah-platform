import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { parts } from './part.js';

export const products = pgTable(
  'products',
  {
    basePrice: numeric('base_price', { mode: 'number', precision: 12, scale: 2 }).notNull(),
    brochureKeyFeatures: jsonb('brochure_key_features').$type<string[]>().notNull().default([]),
    brochureSubtitle: text('brochure_subtitle'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    currencyCode: text('currency_code').notNull().default('ZAR'),
    description: text('description'),
    id: uuid('id').defaultRandom().primaryKey(),
    buildTimeDays: integer('build_time_days').notNull(),
    modelCode: text('model_code').notNull(),
    name: text('name').notNull(),
    requiresVinNumber: boolean('requires_vin_number').notNull().default(false),
    thumbnailDataUrl: text('thumbnail_data_url'),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('products_base_price_nonnegative', sql`${table.basePrice} >= 0`),
    check('products_build_time_days_nonnegative', sql`${table.buildTimeDays} >= 0`),
    uniqueIndex('products_model_code_unique').on(table.modelCode),
    uniqueIndex('products_name_unique').on(table.name),
  ],
);

export const productAssemblies = pgTable(
  'product_assemblies',
  {
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    displayOrder: integer('display_order').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    kind: text('kind', { enum: ['standard', 'optional'] }).notNull(),
    name: text('name').notNull(),
    price: numeric('price', { mode: 'number', precision: 12, scale: 2 }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_assemblies_kind_check', sql`${table.kind} IN ('standard', 'optional')`),
    check('product_assemblies_name_nonempty', sql`length(trim(${table.name})) > 0`),
    check(
      'product_assemblies_price_kind_check',
      sql`(${table.kind} = 'standard' AND ${table.price} IS NULL) OR (${table.kind} = 'optional' AND ${table.price} IS NOT NULL AND ${table.price} >= 0)`,
    ),
    uniqueIndex('product_assemblies_product_id_name_unique').on(table.productId, table.name),
    uniqueIndex('product_assemblies_id_product_id_kind_unique').on(table.id, table.productId, table.kind),
  ],
);

export const assemblyParts = pgTable(
  'assembly_parts',
  {
    assemblyId: uuid('assembly_id')
      .notNull()
      .references(() => productAssemblies.id, { onDelete: 'cascade' }),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.assemblyId, table.partId], name: 'assembly_parts_pkey' }),
    check('assembly_parts_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const assemblyOverrides = pgTable(
  'assembly_overrides',
  {
    optionalAssemblyId: uuid('optional_assembly_id').notNull(),
    optionalKind: text('optional_kind').notNull().generatedAlwaysAs(sql`'optional'`),
    productId: uuid('product_id').notNull(),
    standardAssemblyId: uuid('standard_assembly_id').notNull(),
    standardKind: text('standard_kind').notNull().generatedAlwaysAs(sql`'standard'`),
  },
  (table) => [
    primaryKey({
      columns: [table.optionalAssemblyId, table.standardAssemblyId],
      name: 'assembly_overrides_pkey',
    }),
    foreignKey({
      columns: [table.optionalAssemblyId, table.productId, table.optionalKind],
      foreignColumns: [productAssemblies.id, productAssemblies.productId, productAssemblies.kind],
      name: 'assembly_overrides_optional_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.standardAssemblyId, table.productId, table.standardKind],
      foreignColumns: [productAssemblies.id, productAssemblies.productId, productAssemblies.kind],
      name: 'assembly_overrides_standard_fk',
    }).onDelete('cascade'),
  ],
);

export const productsRelations = relations(products, ({ many }) => ({
  assemblies: many(productAssemblies),
}));

export const productAssembliesRelations = relations(productAssemblies, ({ many, one }) => ({
  assemblyParts: many(assemblyParts),
  optionalOverrides: many(assemblyOverrides, { relationName: 'optionalAssemblyOverrides' }),
  product: one(products, {
    fields: [productAssemblies.productId],
    references: [products.id],
  }),
  standardOverrides: many(assemblyOverrides, { relationName: 'standardAssemblyOverrides' }),
}));

export const assemblyPartsRelations = relations(assemblyParts, ({ one }) => ({
  assembly: one(productAssemblies, {
    fields: [assemblyParts.assemblyId],
    references: [productAssemblies.id],
  }),
  part: one(parts, {
    fields: [assemblyParts.partId],
    references: [parts.id],
  }),
}));

export const assemblyOverridesRelations = relations(assemblyOverrides, ({ one }) => ({
  optionalAssembly: one(productAssemblies, {
    fields: [assemblyOverrides.optionalAssemblyId],
    references: [productAssemblies.id],
    relationName: 'optionalAssemblyOverrides',
  }),
  standardAssembly: one(productAssemblies, {
    fields: [assemblyOverrides.standardAssemblyId],
    references: [productAssemblies.id],
    relationName: 'standardAssemblyOverrides',
  }),
}));
