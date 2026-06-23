import { sql } from 'drizzle-orm';
import { check, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const productRanges = pgTable(
  'product_ranges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // The Range's single presentation image, stored as a {@link StoredImageRef} (bytes live in object
    // storage). Inline structural type rather than the alias so the inferred row type stays portable into
    // @pkg/api's emitted declarations (avoids TS2883). Null means no current image.
    image: jsonb('image').$type<{ byteSize: number; contentType: string; storageKey: string; updatedAt: string }>(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_ranges_name_nonempty', sql`length(trim(${table.name})) > 0`),
    uniqueIndex('product_ranges_name_ci_unique').on(sql`lower(${table.name})`),
  ],
);
