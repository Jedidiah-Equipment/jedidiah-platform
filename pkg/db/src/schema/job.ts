import type { Department, JobStageName, JobStatus } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth.js';
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
    dueDate: date('due_date', { mode: 'string' }),
    status: text('status').notNull().default('pending').$type<JobStatus>(),
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

export const stations = pgTable(
  'station',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    department: text('department').notNull().$type<Department>(),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('station_department_display_order_idx').on(table.department, table.displayOrder),
    uniqueIndex('station_department_name_unique').on(table.department, table.name),
  ],
);

export const jobStageStations = pgTable(
  'job_stage_station',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobStageId: uuid('job_stage_id')
      .notNull()
      .references(() => jobStages.id, { onDelete: 'cascade' }),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id, { onDelete: 'restrict' }),
    plannedStart: date('planned_start', { mode: 'string' }),
    plannedEnd: date('planned_end', { mode: 'string' }),
    actualStart: timestamp('actual_start', { mode: 'date', withTimezone: true }),
    actualEnd: timestamp('actual_end', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('job_stage_station_job_stage_id_idx').on(table.jobStageId),
    index('job_stage_station_station_id_idx').on(table.stationId),
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
  quote: one(quotes, {
    fields: [jobs.quoteId],
    references: [quotes.id],
  }),
  stages: many(jobStages),
}));

export const jobStagesRelations = relations(jobStages, ({ many, one }) => ({
  job: one(jobs, {
    fields: [jobStages.jobId],
    references: [jobs.id],
  }),
  stations: many(jobStageStations),
}));

export const stationsRelations = relations(stations, ({ many }) => ({
  bookings: many(jobStageStations),
}));

export const jobStageStationsRelations = relations(jobStageStations, ({ one }) => ({
  jobStage: one(jobStages, {
    fields: [jobStageStations.jobStageId],
    references: [jobStages.id],
  }),
  station: one(stations, {
    fields: [jobStageStations.stationId],
    references: [stations.id],
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
