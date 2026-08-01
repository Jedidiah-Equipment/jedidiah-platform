import type { PartStockTrackingMode, PartUnitOfMeasure } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { supplier } from './supplier.js';

export const parts = pgTable(
  'parts',
  {
    category: text('category').notNull(),
    code: text('code').notNull(),
    description: text('description').notNull(),
    drawingCode: text('drawing_code'),
    finish: text('finish').notNull(),
    id: uuid('id').defaultRandom().primaryKey(),
    isInternallyFabricated: boolean('is_internally_fabricated').notNull().default(false),
    minimumStock: integer('minimum_stock'),
    name: text('name').notNull(),
    standardPurchaseLengthMm: integer('standard_purchase_length_mm'),
    stockTrackingMode: text('stock_tracking_mode').notNull().default('perpetual').$type<PartStockTrackingMode>(),
    storageLocation: text('storage_location'),
    supplierCode: text('supplier_code').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'restrict' }),
    unitOfMeasure: text('unit_of_measure').notNull().$type<PartUnitOfMeasure>(),
  },
  (table) => [
    check('parts_minimum_stock_nonnegative', sql`${table.minimumStock} IS NULL OR ${table.minimumStock} >= 0`),
    check(
      'parts_standard_purchase_length_mm_positive',
      sql`${table.standardPurchaseLengthMm} IS NULL OR ${table.standardPurchaseLengthMm} > 0`,
    ),
    check(
      'parts_standard_purchase_length_mm_unit_check',
      sql`(${table.unitOfMeasure} = 'mm' AND ${table.standardPurchaseLengthMm} IS NOT NULL) OR (${table.unitOfMeasure} <> 'mm' AND ${table.standardPurchaseLengthMm} IS NULL)`,
    ),
    check('parts_stock_tracking_mode_check', sql`${table.stockTrackingMode} IN ('perpetual', 'periodic')`),
    check(
      'parts_storage_location_nonempty',
      sql`${table.storageLocation} IS NULL OR length(trim(${table.storageLocation})) > 0`,
    ),
    index('parts_category_idx').on(table.category),
    index('parts_storage_location_idx').on(table.storageLocation),
    index('parts_supplier_id_idx').on(table.supplierId),
    uniqueIndex('parts_code_unique').on(table.code),
  ],
);

export const partsRelations = relations(parts, ({ one }) => ({
  supplier: one(supplier, {
    fields: [parts.supplierId],
    references: [supplier.id],
  }),
}));
