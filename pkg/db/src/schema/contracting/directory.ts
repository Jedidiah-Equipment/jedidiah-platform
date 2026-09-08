import { sql } from 'drizzle-orm';
import { boolean, check, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contractingSchema } from './pg-schema.js';

export const contractingCustomers = contractingSchema.table(
  'customer',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('customer_name_ci_unique').on(sql`lower(${table.name})`),
    check('customer_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
);

export const contractingFarms = contractingSchema.table(
  'farm',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => contractingCustomers.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
  },
  (table) => [
    uniqueIndex('farm_customer_name_ci_unique').on(table.customerId, sql`lower(${table.name})`),
    check('farm_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
);

export const contractingWorkTypes = contractingSchema.table(
  'work_type',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    active: boolean('active').default(true).notNull(),
  },
  (table) => [
    uniqueIndex('work_type_name_ci_unique').on(sql`lower(${table.name})`),
    check('work_type_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
);
