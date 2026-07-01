import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const supplier = pgTable(
  'supplier',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    companyName: text('company_name').notNull(),
    email: text('email'),
    address: text('address'),
    contactPerson: text('contact_person'),
    phone: text('phone'),
    notes: text('notes'),
    thumbnailDataUrl: text('thumbnail_data_url'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [uniqueIndex('supplier_company_name_unique').on(table.companyName).where(sql`${table.deletedAt} is null`)],
);
