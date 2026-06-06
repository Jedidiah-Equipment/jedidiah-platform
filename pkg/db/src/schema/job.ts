import type { Department, JobStageName } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  integer,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
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

export const jobBays = pgTable(
  'job_bay',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    department: text('department').notNull().$type<Department>(),
    name: text('name').notNull(),
    scheduleOrigin: timestamp('schedule_origin', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check(
      'job_bay_department_check',
      sql`${table.department} IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly')`,
    ),
    check('job_bay_name_nonempty', sql`length(trim(${table.name})) > 0`),
  ],
);

export const workingCalendarOffDays = pgTable(
  'working_calendar_off_day',
  {
    date: date('date', { mode: 'string' }).primaryKey(),
    label: text('label'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('working_calendar_off_day_label_nonempty', sql`${table.label} IS NULL OR length(trim(${table.label})) > 0`),
  ],
);

export const jobBayCalendarExceptions = pgTable(
  'job_bay_calendar_exception',
  {
    bayId: uuid('bay_id')
      .notNull()
      .references(() => jobBays.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    direction: text('direction', { enum: ['work', 'off'] })
      .notNull()
      .$type<'work' | 'off'>(),
    label: text('label'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.bayId, table.date], name: 'job_bay_calendar_exception_pkey' }),
    check('job_bay_calendar_exception_direction_check', sql`${table.direction} IN ('work', 'off')`),
    check('job_bay_calendar_exception_label_nonempty', sql`${table.label} IS NULL OR length(trim(${table.label})) > 0`),
  ],
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
    vinNumber: text('vin_number'),
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
    sequence: integer('sequence').notNull(),
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

export const jobSlots = pgTable(
  'job_slot',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bayId: uuid('bay_id')
      .notNull()
      .references(() => jobBays.id, { onDelete: 'restrict' }),
    jobStageId: uuid('job_stage_id').references(() => jobStages.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['work', 'idle'] }).notNull(),
    label: text('label'),
    sequence: integer('sequence').notNull(),
    durationDays: integer('duration_days').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('job_slot_kind_check', sql`${table.kind} IN ('work', 'idle')`),
    check(
      'job_slot_work_stage_required_idle_stage_forbidden',
      sql`(${table.kind} = 'work' AND ${table.jobStageId} IS NOT NULL) OR (${table.kind} = 'idle' AND ${table.jobStageId} IS NULL)`,
    ),
    check('job_slot_idle_label_only', sql`${table.label} IS NULL OR ${table.kind} = 'idle'`),
    check('job_slot_label_nonempty', sql`${table.label} IS NULL OR length(trim(${table.label})) > 0`),
    check('job_slot_sequence_positive', sql`${table.sequence} > 0`),
    check('job_slot_duration_days_positive', sql`${table.durationDays} > 0`),
    unique('job_slot_bay_id_sequence_unique').on(table.bayId, table.sequence),
  ],
);

export const jobBaysRelations = relations(jobBays, ({ many }) => ({
  calendarExceptions: many(jobBayCalendarExceptions),
  slots: many(jobSlots),
}));

export const jobBayCalendarExceptionsRelations = relations(jobBayCalendarExceptions, ({ one }) => ({
  bay: one(jobBays, {
    fields: [jobBayCalendarExceptions.bayId],
    references: [jobBays.id],
  }),
}));

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

export const jobStagesRelations = relations(jobStages, ({ many, one }) => ({
  job: one(jobs, {
    fields: [jobStages.jobId],
    references: [jobs.id],
  }),
  slots: many(jobSlots),
}));

export const jobSlotsRelations = relations(jobSlots, ({ one }) => ({
  bay: one(jobBays, {
    fields: [jobSlots.bayId],
    references: [jobBays.id],
  }),
  stage: one(jobStages, {
    fields: [jobSlots.jobStageId],
    references: [jobStages.id],
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
