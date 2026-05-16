import type { JobLifecycleStatus, JobStageName, JobStageStatus } from '@pkg/schema';
import { relations } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth.js';
import { products } from './product.js';

export const jobs = pgTable(
  'job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: text('code').notNull(),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    lifecycleStatus: text('lifecycle_status').notNull().default('active').$type<JobLifecycleStatus>(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('job_code_unique').on(table.code)],
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
    status: text('status').notNull().default('pending').$type<JobStageStatus>(),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    uniqueIndex('job_stage_job_id_sequence_unique').on(table.jobId, table.sequence),
    uniqueIndex('job_stage_job_id_stage_unique').on(table.jobId, table.stage),
  ],
);

export const jobEvents = pgTable(
  'job_event',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').references(() => jobStages.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_event_job_id_occurred_at_idx').on(table.jobId, table.occurredAt),
    index('job_event_stage_id_occurred_at_idx').on(table.stageId, table.occurredAt),
  ],
);

export const jobsRelations = relations(jobs, ({ many, one }) => ({
  events: many(jobEvents),
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

export const jobEventsRelations = relations(jobEvents, ({ one }) => ({
  actor: one(user, {
    fields: [jobEvents.actorUserId],
    references: [user.id],
  }),
  job: one(jobs, {
    fields: [jobEvents.jobId],
    references: [jobs.id],
  }),
  stage: one(jobStages, {
    fields: [jobEvents.stageId],
    references: [jobStages.id],
  }),
}));
