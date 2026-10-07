import { breakdownStatuses, breakdownUrgencies } from '@pkg/schema/contracting';
import { relations, sql } from 'drizzle-orm';
import { check, index, jsonb, numeric, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { quotedList, timestamps } from './columns.js';
import { contractingImplements, contractingMachines } from './fleet.js';
import { contractingJobs } from './jobs.js';
import { contractingSchema } from './pg-schema.js';

export const contractingBreakdowns = contractingSchema.table(
  'breakdown',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    machineId: uuid('machine_id').references(() => contractingMachines.id, { onDelete: 'restrict' }),
    implementId: uuid('implement_id').references(() => contractingImplements.id, { onDelete: 'restrict' }),
    jobId: uuid('job_id').references(() => contractingJobs.id, { onDelete: 'restrict' }),
    reportedByUserId: text('reported_by_user_id')
      .notNull()
      .references(() => user.id),
    reportedAt: timestamp('reported_at', { withTimezone: true }).defaultNow().notNull(),
    urgency: text('urgency', { enum: breakdownUrgencies }).notNull(),
    status: text('status', { enum: breakdownStatuses }).notNull().default('open'),
    description: text('description').notNull(),
    latitude: numeric('latitude', { precision: 9, scale: 6, mode: 'number' }),
    longitude: numeric('longitude', { precision: 9, scale: 6, mode: 'number' }),
    photos: jsonb('photos')
      .$type<{ id: string; byteSize: number; contentType: string; storageKey: string; updatedAt: string }[]>()
      .notNull()
      .default([]),
    primaryMechanicUserId: text('primary_mechanic_user_id').references(() => user.id, { onDelete: 'restrict' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    startedByUserId: text('started_by_user_id').references(() => user.id),
    solvedAt: timestamp('solved_at', { withTimezone: true }),
    solvedByUserId: text('solved_by_user_id').references(() => user.id),
    closeOutNote: text('close_out_note'),
    ...timestamps(),
  },
  (table) => [
    check('breakdown_subject', sql`(${table.machineId} IS NULL) <> (${table.implementId} IS NULL)`),
    check('breakdown_urgency', sql`${table.urgency} IN (${quotedList(breakdownUrgencies)})`),
    check('breakdown_status', sql`${table.status} IN (${quotedList(breakdownStatuses)})`),
    check('breakdown_description_not_blank', sql`length(btrim(${table.description})) > 0`),
    check('breakdown_gps_shape', sql`(${table.latitude} IS NULL) = (${table.longitude} IS NULL)`),
    check(
      'breakdown_status_shape',
      sql`(${table.status} = 'open' AND ${table.startedAt} IS NULL AND ${table.solvedAt} IS NULL AND ${table.closeOutNote} IS NULL) OR (${table.status} = 'in-progress' AND ${table.startedAt} IS NOT NULL AND ${table.solvedAt} IS NULL AND ${table.closeOutNote} IS NULL) OR (${table.status} = 'solved' AND ${table.startedAt} IS NOT NULL AND ${table.solvedAt} IS NOT NULL AND length(btrim(${table.closeOutNote})) > 0)`,
    ),
    index('breakdown_machine_idx').on(table.machineId, table.reportedAt),
    index('breakdown_implement_idx').on(table.implementId, table.reportedAt),
    index('breakdown_job_idx').on(table.jobId),
    index('breakdown_status_idx').on(table.status, table.reportedAt),
    index('breakdown_mechanic_idx').on(table.primaryMechanicUserId),
  ],
);

export const contractingBreakdownNotes = contractingSchema.table(
  'breakdown_note',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    breakdownId: uuid('breakdown_id')
      .notNull()
      .references(() => contractingBreakdowns.id, { onDelete: 'restrict' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => user.id),
    text: text('text').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('breakdown_note_breakdown_idx').on(table.breakdownId, table.createdAt),
    check('breakdown_note_text_not_blank', sql`length(btrim(${table.text})) > 0`),
  ],
);

export const contractingBreakdownRelations = relations(contractingBreakdowns, ({ many, one }) => ({
  machine: one(contractingMachines, {
    fields: [contractingBreakdowns.machineId],
    references: [contractingMachines.id],
  }),
  implement: one(contractingImplements, {
    fields: [contractingBreakdowns.implementId],
    references: [contractingImplements.id],
  }),
  reporter: one(user, {
    fields: [contractingBreakdowns.reportedByUserId],
    references: [user.id],
    relationName: 'breakdownReporter',
  }),
  mechanic: one(user, {
    fields: [contractingBreakdowns.primaryMechanicUserId],
    references: [user.id],
    relationName: 'breakdownMechanic',
  }),
  notes: many(contractingBreakdownNotes),
}));
export const contractingBreakdownNoteRelations = relations(contractingBreakdownNotes, ({ one }) => ({
  breakdown: one(contractingBreakdowns, {
    fields: [contractingBreakdownNotes.breakdownId],
    references: [contractingBreakdowns.id],
  }),
}));
