import { sql } from 'drizzle-orm';
import { check, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { equipmentSchema } from './pg-schema.js';

// Relations live in part.ts so this file never imports it back.
export const partCategories = equipmentSchema.table(
  'part_category',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('part_category_name_nonempty', sql`length(trim(${table.name})) > 0`),
    uniqueIndex('part_category_name_ci_unique').on(sql`lower(${table.name})`),
  ],
);
