import { pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const supplier = pgTable(
  'supplier',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
  },
  (table) => [uniqueIndex('supplier_name_unique').on(table.name)],
);
