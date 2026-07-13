import { relations, sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const productRanges = pgTable(
  'product_ranges',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    // The Range's single presentation image, stored as a {@link StoredFile} (bytes live in object
    // storage). Inline structural type rather than the alias so the inferred row type stays portable into
    // @pkg/api's emitted declarations (avoids TS2883). Null means no current image.
    image: jsonb('image').$type<{ byteSize: number; contentType: string; storageKey: string; updatedAt: string }>(),
    // The Range's brochure logo (top-right of the product brochure), stored as a {@link StoredFile}.
    // Inline structural type for the same portability reason as `image`. Null means no current logo.
    logo: jsonb('logo').$type<{ byteSize: number; contentType: string; storageKey: string; updatedAt: string }>(),
    // Inline structural type keeps inferred row declarations portable across package boundaries (TS2883).
    translations: jsonb('translations')
      .$type<
        Partial<Record<string, { sourceHash: string; translatedAt: string; name: string; description: string | null }>>
      >()
      .notNull()
      .default({}),
    // Admin-controlled position in the Range list (admin grid + public lander). Assigned sequentially on
    // create and rewritten by the reorder mutation.
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_ranges_name_nonempty', sql`length(trim(${table.name})) > 0`),
    uniqueIndex('product_ranges_name_ci_unique').on(sql`lower(${table.name})`).where(sql`${table.deletedAt} is null`),
  ],
);

export const productRangeVariants = pgTable(
  'product_range_variants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    rangeId: uuid('range_id')
      .notNull()
      .references(() => productRanges.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    // Inline for the same emitted-declaration portability constraint as Range translations above.
    translations: jsonb('translations')
      .$type<Partial<Record<string, { sourceHash: string; translatedAt: string; name: string }>>>()
      .notNull()
      .default({}),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('product_range_variants_name_nonempty', sql`length(trim(${table.name})) > 0`),
    uniqueIndex('product_range_variants_range_name_ci_unique')
      .on(table.rangeId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} is null`),
    uniqueIndex('product_range_variants_id_range_id_unique').on(table.id, table.rangeId),
  ],
);

export const productRangesRelations = relations(productRanges, ({ many }) => ({
  variants: many(productRangeVariants),
}));

export const productRangeVariantsRelations = relations(productRangeVariants, ({ one }) => ({
  range: one(productRanges, {
    fields: [productRangeVariants.rangeId],
    references: [productRanges.id],
  }),
}));
