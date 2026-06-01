import type { JobStageName } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { parts } from './part.js';
import { products } from './product.js';
import { quotes } from './quote.js';

export const jobCodeSequence = pgSequence('job_code_seq');

export const productSerialSequences = pgTable(
  'product_serial_sequence',
  {
    productId: uuid('product_id')
      .primaryKey()
      .references(() => products.id, { onDelete: 'restrict' }),
    lastSequence: integer('last_sequence').notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check('product_serial_sequence_last_sequence_positive', sql`${table.lastSequence} > 0`)],
);

export const jobs = pgTable(
  'job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: integer('code').notNull().default(sql`nextval('job_code_seq'::regclass)`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    quoteId: uuid('quote_id')
      .notNull()
      .references(() => quotes.id, { onDelete: 'restrict' }),
    productSerialPrefix: text('product_serial_prefix').notNull(),
    productSerialYear: integer('product_serial_year').notNull(),
    productSerialSequence: integer('product_serial_sequence').notNull(),
    productSerialNumber: text('product_serial_number').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('job_product_serial_prefix_nonempty', sql`length(trim(${table.productSerialPrefix})) > 0`),
    check('job_product_serial_year_range', sql`${table.productSerialYear} >= 0 AND ${table.productSerialYear} <= 99`),
    check('job_product_serial_sequence_positive', sql`${table.productSerialSequence} > 0`),
    check('job_product_serial_number_nonempty', sql`length(trim(${table.productSerialNumber})) > 0`),
    uniqueIndex('job_code_unique').on(table.code),
    uniqueIndex('job_product_serial_number_unique').on(table.productSerialNumber),
    uniqueIndex('job_quote_id_unique').on(table.quoteId),
  ],
);

export const jobCfoAssemblies = pgTable(
  'job_cfo_assembly',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    assemblyName: text('assembly_name').notNull(),
    kind: text('kind', { enum: ['standard', 'optional'] }).notNull(),
  },
  (table) => [
    check('job_cfo_assembly_name_nonempty', sql`length(trim(${table.assemblyName})) > 0`),
    check('job_cfo_assembly_kind_check', sql`${table.kind} IN ('standard', 'optional')`),
  ],
);

export const jobCfoParts = pgTable(
  'job_cfo_part',
  {
    cfoAssemblyId: uuid('cfo_assembly_id')
      .notNull()
      .references(() => jobCfoAssemblies.id, { onDelete: 'cascade' }),
    partId: uuid('part_id')
      .notNull()
      .references(() => parts.id, { onDelete: 'restrict' }),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.cfoAssemblyId, table.partId], name: 'job_cfo_part_pkey' }),
    check('job_cfo_part_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const jobStages = pgTable(
  'job_stage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    stage: text('stage').notNull().$type<JobStageName>(),
  },
  (table) => [
    uniqueIndex('job_stage_job_id_sequence_unique').on(table.jobId, table.sequence),
    uniqueIndex('job_stage_job_id_stage_unique').on(table.jobId, table.stage),
  ],
);

export const jobsRelations = relations(jobs, ({ many, one }) => ({
  product: one(products, {
    fields: [jobs.productId],
    references: [products.id],
  }),
  quote: one(quotes, {
    fields: [jobs.quoteId],
    references: [quotes.id],
  }),
  cfoAssemblies: many(jobCfoAssemblies),
  stages: many(jobStages),
}));

export const jobStagesRelations = relations(jobStages, ({ one }) => ({
  job: one(jobs, {
    fields: [jobStages.jobId],
    references: [jobs.id],
  }),
}));

export const jobCfoAssembliesRelations = relations(jobCfoAssemblies, ({ many, one }) => ({
  job: one(jobs, {
    fields: [jobCfoAssemblies.jobId],
    references: [jobs.id],
  }),
  parts: many(jobCfoParts),
}));

export const jobCfoPartsRelations = relations(jobCfoParts, ({ one }) => ({
  assembly: one(jobCfoAssemblies, {
    fields: [jobCfoParts.cfoAssemblyId],
    references: [jobCfoAssemblies.id],
  }),
  part: one(parts, {
    fields: [jobCfoParts.partId],
    references: [parts.id],
  }),
}));
