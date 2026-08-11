import type { PartStockTrackingMode, PartUnitOfMeasure } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

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
    // Null on a Built Part. The XOR invariant below is the stored form of "a Part has either a
    // Supplier or a BOM"; the BOM side is service-enforced, since a check cannot see `part_bom`.
    supplierId: uuid('supplier_id').references(() => supplier.id, { onDelete: 'restrict' }),
    unitOfMeasure: text('unit_of_measure').notNull().$type<PartUnitOfMeasure>(),
  },
  (table) => [
    // A Build posts one row at consumed value ÷ units built and names no length bucket, so a Built
    // Part measured in millimetres is a Part the Build event could never produce.
    check('parts_fabricated_not_linear', sql`NOT (${table.isInternallyFabricated} AND ${table.unitOfMeasure} = 'mm')`),
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
      'parts_supplier_or_bom',
      sql`(${table.isInternallyFabricated} AND ${table.supplierId} IS NULL) OR (NOT ${table.isInternallyFabricated} AND ${table.supplierId} IS NOT NULL)`,
    ),
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

/**
 * One line of a Built Part's Bill of Materials: how much of a component one unit of the parent
 * consumes. BOMs nest but builds never recurse (spec §6), so the graph must stay acyclic — the
 * table can only forbid the self-reference, and the transitive walk lives in the service.
 */
export const partBom = pgTable(
  'part_bom',
  {
    componentPartId: uuid('component_part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    parentPartId: uuid('parent_part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    quantity: numeric('quantity', { mode: 'number', precision: 14, scale: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.parentPartId, table.componentPartId], name: 'part_bom_pkey' }),
    check('part_bom_quantity_positive', sql`${table.quantity} > 0`),
    check('part_bom_no_self_reference', sql`${table.parentPartId} <> ${table.componentPartId}`),
    index('part_bom_component_part_id_idx').on(table.componentPartId),
  ],
);

export const partBomRelations = relations(partBom, ({ one }) => ({
  component: one(parts, {
    fields: [partBom.componentPartId],
    references: [parts.id],
    relationName: 'partBomComponent',
  }),
  parent: one(parts, {
    fields: [partBom.parentPartId],
    references: [parts.id],
    relationName: 'partBomParent',
  }),
}));
