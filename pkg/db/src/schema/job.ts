import type { Department } from '@pkg/schema';
import { relations, sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
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
import { user } from './auth.js';
import { parts } from './part.js';
import { productAssemblies, products } from './product.js';
import { productUnits } from './product-unit.js';
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
    // Plant business date; set by core at Bay creation, never defaulted by the DB.
    scheduleOrigin: date('schedule_origin', { mode: 'string' }).notNull(),
    disabledAt: timestamp('disabled_at', { mode: 'date', withTimezone: true }),
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

export const jobBayOperatorAssignments = pgTable(
  'job_bay_operator_assignment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bayId: uuid('bay_id')
      .notNull()
      .references(() => jobBays.id, { onDelete: 'restrict' }),
    operatorUserId: text('operator_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    assignedAt: timestamp('assigned_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    unassignedAt: timestamp('unassigned_at', { mode: 'date', withTimezone: true }),
  },
  (table) => [
    check(
      'job_bay_operator_assignment_interval_order',
      sql`${table.unassignedAt} IS NULL OR ${table.unassignedAt} >= ${table.assignedAt}`,
    ),
    uniqueIndex('job_bay_operator_assignment_open_bay_unique')
      .on(table.bayId)
      .where(sql`${table.unassignedAt} IS NULL`),
  ],
);

export const productBays = pgTable(
  'product_bay',
  {
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    bayId: uuid('bay_id')
      .notNull()
      .references(() => jobBays.id, { onDelete: 'restrict' }),
    defaultWorkingDays: integer('default_working_days').notNull(),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.bayId], name: 'product_bay_pkey' }),
    check('product_bay_default_working_days_positive', sql`${table.defaultWorkingDays} > 0`),
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
    // The physical machine this Job builds or works on, and the only thing that makes this a Product
    // Job. Null for a Custom Job, which produces no machine. Serial, Product, and VIN live on the Unit.
    productUnitId: uuid('product_unit_id').references(() => productUnits.id, { onDelete: 'restrict' }),
    // Null for a Stock Build, which builds a machine we hold and has no sale behind it. A Custom Job
    // has no Unit, so the table check below still forces it to carry a Quote.
    quoteId: uuid('quote_id').references(() => quotes.id, { onDelete: 'restrict' }),
    description: text('description'),
    // Plant business date the Job finished. Latches: written once by hand or by the completion sweep,
    // never recomputed. Distinct from derived schedule completeness, which still drives the Board.
    completedOn: date('completed_on', { mode: 'string' }),
    cancelledAt: timestamp('cancelled_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    check('job_description_nonempty', sql`${table.description} IS NULL OR length(trim(${table.description})) > 0`),
    // Every Job is either about a machine or about a sale, and usually both: a Stock Build has only a
    // Unit, a Custom Job only a Quote, and a Job with neither describes no work at all.
    check(
      'job_product_unit_or_quote_required',
      sql`${table.productUnitId} IS NOT NULL OR ${table.quoteId} IS NOT NULL`,
    ),
    // The Unit's build state is a correlated lookup of its Jobs, so this FK is read per Unit row.
    index('job_product_unit_id_idx').on(table.productUnitId),
    uniqueIndex('job_code_unique').on(table.code),
    uniqueIndex('job_quote_id_unique').on(table.quoteId),
  ],
);

// A Job's own selection of Optional Assemblies, and the only source its CFO is snapshotted from.
// It carries no price: pricing stays a Quote concern.
export const jobBuildSpecAssemblies = pgTable(
  'job_build_spec_assembly',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    productAssemblyId: uuid('product_assembly_id').references(() => productAssemblies.id, { onDelete: 'set null' }),
    assemblyName: text('assembly_name').notNull(),
    sequence: integer('sequence').notNull(),
  },
  (table) => [
    check('job_build_spec_assembly_name_nonempty', sql`length(trim(${table.assemblyName})) > 0`),
    uniqueIndex('job_build_spec_assembly_job_product_assembly_unique').on(table.jobId, table.productAssemblyId),
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

export const jobSlots = pgTable(
  'job_slot',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bayId: uuid('bay_id')
      .notNull()
      .references(() => jobBays.id, { onDelete: 'restrict' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'cascade' }),
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
      'job_slot_work_job_required_idle_job_forbidden',
      sql`(${table.kind} = 'work' AND ${table.jobId} IS NOT NULL) OR (${table.kind} = 'idle' AND ${table.jobId} IS NULL)`,
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
  operatorAssignments: many(jobBayOperatorAssignments),
  productBays: many(productBays),
  slots: many(jobSlots),
}));

export const jobBayOperatorAssignmentsRelations = relations(jobBayOperatorAssignments, ({ one }) => ({
  bay: one(jobBays, {
    fields: [jobBayOperatorAssignments.bayId],
    references: [jobBays.id],
  }),
  operator: one(user, {
    fields: [jobBayOperatorAssignments.operatorUserId],
    references: [user.id],
  }),
}));

export const productBaysRelations = relations(productBays, ({ one }) => ({
  bay: one(jobBays, {
    fields: [productBays.bayId],
    references: [jobBays.id],
  }),
  product: one(products, {
    fields: [productBays.productId],
    references: [products.id],
  }),
}));

export const jobBayCalendarExceptionsRelations = relations(jobBayCalendarExceptions, ({ one }) => ({
  bay: one(jobBays, {
    fields: [jobBayCalendarExceptions.bayId],
    references: [jobBays.id],
  }),
}));

export const jobsRelations = relations(jobs, ({ many, one }) => ({
  productUnit: one(productUnits, {
    fields: [jobs.productUnitId],
    references: [productUnits.id],
  }),
  quote: one(quotes, {
    fields: [jobs.quoteId],
    references: [quotes.id],
  }),
  buildSpecAssemblies: many(jobBuildSpecAssemblies),
  cfoAssemblies: many(jobCfoAssemblies),
  slots: many(jobSlots),
}));

export const jobBuildSpecAssembliesRelations = relations(jobBuildSpecAssemblies, ({ one }) => ({
  job: one(jobs, {
    fields: [jobBuildSpecAssemblies.jobId],
    references: [jobs.id],
  }),
  productAssembly: one(productAssemblies, {
    fields: [jobBuildSpecAssemblies.productAssemblyId],
    references: [productAssemblies.id],
  }),
}));

export const jobSlotsRelations = relations(jobSlots, ({ one }) => ({
  bay: one(jobBays, {
    fields: [jobSlots.bayId],
    references: [jobBays.id],
  }),
  job: one(jobs, {
    fields: [jobSlots.jobId],
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
