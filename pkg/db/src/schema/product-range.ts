import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const productRanges = pgTable(
  'product_ranges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    imageDataUrl: text('image_data_url'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_ranges_name_nonempty', sql`length(trim(${table.name})) > 0`),
    uniqueIndex('product_ranges_name_ci_unique').on(sql`lower(${table.name})`),
  ],
);
