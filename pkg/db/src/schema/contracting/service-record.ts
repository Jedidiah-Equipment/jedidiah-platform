import { relations, sql } from 'drizzle-orm';
import { check, date, index, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { decimal2, timestamps } from './columns.js';
import { contractingMachines } from './fleet.js';
import { contractingSchema } from './pg-schema.js';

export const contractingServiceRecords = contractingSchema.table(
  'service_record',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => contractingMachines.id, { onDelete: 'restrict' }),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }),
    readingAtServiceHours: decimal2('reading_at_service_hours'),
    primaryMechanicUserId: text('primary_mechanic_user_id').references(() => user.id, { onDelete: 'restrict' }),
    notes: text('notes'),
    nextServiceDueHoursSet: decimal2('next_service_due_hours_set'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedByUserId: text('closed_by_user_id').references(() => user.id),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    ...timestamps(),
  },
  (table) => [
    index('service_record_machine_idx').on(table.machineId, table.startDate),
    check(
      'service_record_closed_shape',
      sql`(${table.closedAt} IS NULL AND ${table.closedByUserId} IS NULL AND ${table.nextServiceDueHoursSet} IS NULL) OR (${table.closedAt} IS NOT NULL AND ${table.closedByUserId} IS NOT NULL AND ${table.endDate} IS NOT NULL AND ${table.readingAtServiceHours} IS NOT NULL AND ${table.nextServiceDueHoursSet} IS NOT NULL)`,
    ),
    check('service_record_dates', sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
  ],
);

export const contractingServiceRecordRelations = relations(contractingServiceRecords, ({ one }) => ({
  machine: one(contractingMachines, {
    fields: [contractingServiceRecords.machineId],
    references: [contractingMachines.id],
  }),
  mechanic: one(user, {
    fields: [contractingServiceRecords.primaryMechanicUserId],
    references: [user.id],
    relationName: 'serviceRecordMechanic',
  }),
  closedBy: one(user, {
    fields: [contractingServiceRecords.closedByUserId],
    references: [user.id],
    relationName: 'serviceRecordClosedBy',
  }),
}));
