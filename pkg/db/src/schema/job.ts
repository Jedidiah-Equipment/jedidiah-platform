import type { JobLifecycleStatus, JobStageName, JobStageStatus } from '@pkg/schema';
import { relations } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { products } from './product.js';

export const jobs = pgTable('job', {
  id: uuid('id').defaultRandom().primaryKey(),
  productId: uuid('product_id')
    .notNull()
    .references(() => products.id, { onDelete: 'restrict' }),
  lifecycleStatus: text('lifecycle_status').notNull().default('active').$type<JobLifecycleStatus>(),
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
});

export const jobStages = pgTable(
  'job_stage',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    sequence: integer('sequence').notNull(),
    stage: text('stage').notNull().$type<JobStageName>(),
    status: text('status').notNull().default('pending').$type<JobStageStatus>(),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
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
  stages: many(jobStages),
}));

export const jobStagesRelations = relations(jobStages, ({ one }) => ({
  job: one(jobs, {
    fields: [jobStages.jobId],
    references: [jobs.id],
  }),
}));
