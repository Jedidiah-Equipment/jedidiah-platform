import type { PartUnitOfMeasure } from '@pkg/schema';
import { relations } from 'drizzle-orm';
import { boolean, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    name: text('name').notNull(),
    supplierCode: text('supplier_code').notNull(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => supplier.id, { onDelete: 'restrict' }),
    unitOfMeasure: text('unit_of_measure').notNull().$type<PartUnitOfMeasure>(),
  },
  (table) => [
    index('parts_category_idx').on(table.category),
    uniqueIndex('parts_code_unique').on(table.code),
    uniqueIndex('parts_supplier_id_supplier_code_unique').on(table.supplierId, table.supplierCode),
  ],
);

export const partsRelations = relations(parts, ({ one }) => ({
  supplier: one(supplier, {
    fields: [parts.supplierId],
    references: [supplier.id],
  }),
}));
