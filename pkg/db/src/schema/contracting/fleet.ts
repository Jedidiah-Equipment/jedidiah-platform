import { relations, sql } from 'drizzle-orm';
import { check, index, integer, numeric, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { contractingSchema } from './pg-schema.js';

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
const retirement = () => ({
  retiredAt: timestamp('retired_at', { withTimezone: true }),
  retiredReason: text('retired_reason'),
});

export const contractingCategories = contractingSchema.table(
  'category',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    presetRate: numeric('preset_rate', { precision: 12, scale: 2, mode: 'number' }).default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('category_name_ci_unique').on(sql`lower(${table.name})`),
    check('category_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('category_rate_nonnegative', sql`${table.presetRate} >= 0`),
  ],
);

export const contractingMachines = contractingSchema.table(
  'machine',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    make: text('make').notNull(),
    model: text('model').notNull(),
    year: integer('year'),
    registration: text('registration'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => contractingCategories.id, { onDelete: 'restrict' }),
    // Cross-row role eligibility is enforced in migration 0134 in both write directions.
    currentDriverUserId: text('current_driver_user_id').references(() => user.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    serviceIntervalHours: numeric('service_interval_hours', { precision: 12, scale: 2, mode: 'number' }),
    nextServiceDueHours: numeric('next_service_due_hours', { precision: 12, scale: 2, mode: 'number' }),
    ...retirement(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('machine_code_ci_unique').on(sql`lower(${table.code})`),
    check('machine_code_uppercase', sql`${table.code} = upper(btrim(${table.code})) AND length(${table.code}) > 0`),
    check(
      'machine_retirement_reason',
      sql`(${table.retiredAt} IS NULL AND ${table.retiredReason} IS NULL) OR (${table.retiredAt} IS NOT NULL AND length(btrim(${table.retiredReason})) > 0 AND ${table.retiredReason} IS NOT NULL)`,
    ),
    check('machine_service_interval_positive', sql`${table.serviceIntervalHours} > 0`),
    check('machine_service_due_nonnegative', sql`${table.nextServiceDueHours} >= 0`),
    index('machine_category_idx').on(table.categoryId),
    index('machine_driver_idx').on(table.currentDriverUserId),
  ],
);

export const contractingImplements = contractingSchema.table(
  'implement',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    implementType: text('implement_type').notNull(),
    notes: text('notes'),
    ...retirement(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('implement_code_ci_unique').on(sql`lower(${table.code})`),
    check('implement_code_uppercase', sql`${table.code} = upper(btrim(${table.code})) AND length(${table.code}) > 0`),
    check(
      'implement_retirement_reason',
      sql`(${table.retiredAt} IS NULL AND ${table.retiredReason} IS NULL) OR (${table.retiredAt} IS NOT NULL AND length(btrim(${table.retiredReason})) > 0 AND ${table.retiredReason} IS NOT NULL)`,
    ),
  ],
);

export const contractingMachineRelations = relations(contractingMachines, ({ one }) => ({
  category: one(contractingCategories, {
    fields: [contractingMachines.categoryId],
    references: [contractingCategories.id],
  }),
  currentDriver: one(user, { fields: [contractingMachines.currentDriverUserId], references: [user.id] }),
}));
