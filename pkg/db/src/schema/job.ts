import type { JobStageName } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import { index, integer, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

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
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('job_code_unique').on(table.code), index('job_quote_id_idx').on(table.quoteId)],
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
  stages: many(jobStages),
}));

export const jobStagesRelations = relations(jobStages, ({ one }) => ({
  job: one(jobs, {
    fields: [jobStages.jobId],
    references: [jobs.id],
  }),
}));
