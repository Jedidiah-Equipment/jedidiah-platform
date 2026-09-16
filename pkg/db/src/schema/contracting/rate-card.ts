import { rateBases } from '@pkg/schema/contracting';
import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, numeric, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contractingSchema } from './pg-schema.js';

const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contractingMeasureTypes = contractingSchema.table(
  'measure_type',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('measure_type_name_ci_unique').on(sql`lower(${table.name})`),
    check('measure_type_name_not_blank', sql`length(btrim(${table.name})) > 0`),
  ],
);

export const contractingRates = contractingSchema.table(
  'rate',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    basis: text('basis', { enum: rateBases }).notNull(),
    measureTypeId: uuid('measure_type_id').references(() => contractingMeasureTypes.id, { onDelete: 'restrict' }),
    amount: numeric('amount', { precision: 12, scale: 2, mode: 'number' }).notNull(),
    displayOrder: integer('display_order').notNull(),
    active: boolean('active').default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('rate_name_ci_unique').on(sql`lower(${table.name})`),
    check('rate_name_not_blank', sql`length(btrim(${table.name})) > 0`),
    check('rate_basis', sql`${table.basis} IN ('time', 'measure')`),
    check(
      'rate_basis_measure_type',
      sql`(${table.basis} = 'time' AND ${table.measureTypeId} IS NULL) OR (${table.basis} = 'measure' AND ${table.measureTypeId} IS NOT NULL)`,
    ),
    check('rate_amount_positive', sql`${table.amount} > 0`),
    index('rate_measure_type_idx').on(table.measureTypeId),
  ],
);
