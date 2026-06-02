import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const customers = pgTable('customers', {
  id: uuid('id').defaultRandom().primaryKey(),
  companyName: text('company_name').notNull(),
  email: text('email'),
  vatNumber: text('vat_number'),
  address: text('address'),
  contactPerson: text('contact_person'),
  phone: text('phone'),
  notes: text('notes'),
  thumbnailDataUrl: text('thumbnail_data_url'),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});
