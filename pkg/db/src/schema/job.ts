import type { JobStageName } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { check, integer, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { parts } from './part.js';
import { products } from './product.js';
import { quotes } from './quote.js';

export const jobCodeSequence = pgSequence('job_code_seq');

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
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('job_code_unique').on(table.code), uniqueIndex('job_quote_id_unique').on(table.quoteId)],
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
  (table) => [check('job_cfo_part_quantity_positive', sql`${table.quantity} > 0`)],
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
