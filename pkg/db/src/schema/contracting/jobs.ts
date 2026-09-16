import { discountKinds, jobStatuses } from '@pkg/schema/contracting';
import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '../auth.js';
import { contractingCustomers, contractingFarms, contractingWorkTypes } from './directory.js';
import { contractingImplements, contractingMachines } from './fleet.js';
import { contractingHourReadings } from './hour-reading.js';
import { contractingSchema } from './pg-schema.js';
import { contractingMeasureTypes, contractingRates } from './rate-card.js';

const money = (name: string) => numeric(name, { precision: 12, scale: 2, mode: 'number' });
const hours = (name: string) => numeric(name, { precision: 10, scale: 1, mode: 'number' });
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contractingJobCodeSequence = contractingSchema.sequence('job_code_seq');

export const contractingJobs = contractingSchema.table(
  'job',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    code: integer('code').notNull().default(sql`nextval('contracting.job_code_seq'::regclass)`),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => contractingCustomers.id, { onDelete: 'restrict' }),
    farmId: uuid('farm_id').notNull(),
    workTypeId: uuid('work_type_id')
      .notNull()
      .references(() => contractingWorkTypes.id, { onDelete: 'restrict' }),
    description: text('description'),
    foremanUserId: text('foreman_user_id').references(() => user.id, { onDelete: 'restrict' }),
    status: text('status', { enum: jobStatuses }).notNull().default('upcoming'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    notes: text('notes'),
    dieselLitres: money('diesel_litres').notNull().default(0),
    dieselUnitPrice: money('diesel_unit_price'),
    dieselAmount: money('diesel_amount'),
    discountKind: text('discount_kind', { enum: discountKinds }),
    discountValue: money('discount_value'),
    discountAmount: money('discount_amount'),
    pricedSubtotal: money('priced_subtotal'),
    pricedTotal: money('priced_total'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByUserId: text('completed_by_user_id').references(() => user.id),
    pricedAt: timestamp('priced_at', { withTimezone: true }),
    pricedByUserId: text('priced_by_user_id').references(() => user.id),
    invoiceNumber: text('invoice_number'),
    invoicedAt: timestamp('invoiced_at', { withTimezone: true }),
    invoicedByUserId: text('invoiced_by_user_id').references(() => user.id),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledByUserId: text('cancelled_by_user_id').references(() => user.id),
    cancellationReason: text('cancellation_reason'),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('job_code_unique').on(table.code),
    index('job_status_idx').on(table.status),
    index('job_foreman_idx').on(table.foremanUserId),
    foreignKey({
      columns: [table.farmId, table.customerId],
      foreignColumns: [contractingFarms.id, contractingFarms.customerId],
      name: 'job_farm_customer_fk',
    }).onDelete('restrict'),
    check('job_status', sql`${table.status} IN ('upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled')`),
    check(
      'job_completed_shape',
      sql`(${table.status} IN ('upcoming', 'active', 'cancelled')) = (${table.completedAt} IS NULL) AND (${table.completedAt} IS NULL) = (${table.completedByUserId} IS NULL) AND (${table.completedAt} IS NULL OR (${table.startDate} IS NOT NULL AND ${table.endDate} IS NOT NULL AND ${table.startDate} <= ${table.endDate}))`,
    ),
    check(
      'job_priced_shape',
      sql`(${table.status} IN ('priced', 'invoiced')) = (${table.pricedAt} IS NOT NULL) AND (${table.pricedAt} IS NULL) = (${table.pricedSubtotal} IS NULL) AND (${table.pricedAt} IS NULL) = (${table.pricedTotal} IS NULL) AND (${table.pricedAt} IS NULL OR ${table.dieselLitres} = 0 OR ${table.dieselAmount} IS NOT NULL)`,
    ),
    check(
      'job_invoiced_shape',
      sql`(${table.status} = 'invoiced') = (${table.invoiceNumber} IS NOT NULL) AND (${table.invoiceNumber} IS NULL) = (${table.invoicedAt} IS NULL) AND (${table.invoiceNumber} IS NULL OR length(btrim(${table.invoiceNumber})) > 0)`,
    ),
    check(
      'job_cancelled_shape',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} IS NOT NULL) AND (${table.cancelledAt} IS NULL) = (${table.cancellationReason} IS NULL) AND (${table.cancellationReason} IS NULL OR length(btrim(${table.cancellationReason})) > 0)`,
    ),
    check(
      'job_diesel_shape',
      sql`${table.dieselLitres} >= 0 AND (${table.dieselUnitPrice} IS NULL OR ${table.dieselUnitPrice} >= 0) AND (${table.dieselAmount} IS NULL OR ${table.dieselAmount} >= 0)`,
    ),
    check(
      'job_discount_shape',
      sql`(${table.discountKind} IS NULL AND ${table.discountValue} IS NULL AND ${table.discountAmount} IS NULL) OR (${table.discountKind} IN ('amount', 'percent') AND ${table.discountValue} >= 0 AND (${table.discountKind} <> 'percent' OR ${table.discountValue} <= 100))`,
    ),
  ],
);

export const contractingMachineAssignments = contractingSchema.table(
  'machine_assignment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => contractingJobs.id, { onDelete: 'restrict' }),
    machineId: uuid('machine_id')
      .notNull()
      .references(() => contractingMachines.id, { onDelete: 'restrict' }),
    implementId: uuid('implement_id').references(() => contractingImplements.id, { onDelete: 'restrict' }),
    driverUserId: text('driver_user_id').references(() => user.id, { onDelete: 'restrict' }),
    arrivalReadingId: uuid('arrival_reading_id').references(() => contractingHourReadings.id, {
      onDelete: 'restrict',
    }),
    departureReadingId: uuid('departure_reading_id').references(() => contractingHourReadings.id, {
      onDelete: 'restrict',
    }),
    travelIncluded: boolean('travel_included').notNull().default(true),
    gapTravelHours: hours('gap_travel_hours'),
    gapUnaccountedHours: hours('gap_unaccounted_hours'),
    gapReason: text('gap_reason'),
    gapResolvedAt: timestamp('gap_resolved_at', { withTimezone: true }),
    gapResolvedByUserId: text('gap_resolved_by_user_id').references(() => user.id),
    rateId: uuid('rate_id').references(() => contractingRates.id, { onDelete: 'restrict' }),
    rateName: text('rate_name'),
    rateBasis: text('rate_basis'),
    rateMeasureTypeId: uuid('rate_measure_type_id').references(() => contractingMeasureTypes.id, {
      onDelete: 'restrict',
    }),
    rateUnitAmount: money('rate_unit_amount'),
    computedAmount: money('computed_amount'),
    finalAmount: money('final_amount'),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    ...timestamps(),
  },
  (table) => [
    index('machine_assignment_job_idx').on(table.jobId),
    index('machine_assignment_machine_idx').on(table.machineId),
    uniqueIndex('machine_assignment_arrival_unique').on(table.arrivalReadingId),
    uniqueIndex('machine_assignment_departure_unique').on(table.departureReadingId),
    uniqueIndex('machine_assignment_machine_on_site_unique')
      .on(table.machineId)
      .where(sql`${table.arrivalReadingId} IS NOT NULL AND ${table.departureReadingId} IS NULL`),
    uniqueIndex('machine_assignment_implement_on_site_unique')
      .on(table.implementId)
      .where(
        sql`${table.implementId} IS NOT NULL AND ${table.arrivalReadingId} IS NOT NULL AND ${table.departureReadingId} IS NULL`,
      ),
    check(
      'machine_assignment_departure_needs_arrival',
      sql`${table.departureReadingId} IS NULL OR ${table.arrivalReadingId} IS NOT NULL`,
    ),
    check(
      'machine_assignment_gap_shape',
      sql`(${table.gapResolvedAt} IS NULL AND ${table.gapTravelHours} IS NULL AND ${table.gapUnaccountedHours} IS NULL AND ${table.gapReason} IS NULL AND ${table.gapResolvedByUserId} IS NULL) OR (${table.gapResolvedAt} IS NOT NULL AND ${table.gapTravelHours} >= 0 AND ${table.gapUnaccountedHours} >= 0 AND length(btrim(${table.gapReason})) > 0 AND ${table.gapResolvedByUserId} IS NOT NULL)`,
    ),
    check(
      'machine_assignment_pricing_shape',
      sql`(${table.rateUnitAmount} IS NULL AND ${table.computedAmount} IS NULL AND ${table.finalAmount} IS NULL AND ${table.rateName} IS NULL AND ${table.rateBasis} IS NULL AND ${table.rateId} IS NULL AND ${table.rateMeasureTypeId} IS NULL) OR (${table.computedAmount} >= 0 AND ${table.finalAmount} >= 0 AND ((${table.rateId} IS NULL AND ${table.rateName} IS NULL AND ${table.rateUnitAmount} = 0) OR (${table.rateId} IS NOT NULL AND length(btrim(${table.rateName})) > 0 AND ${table.rateBasis} IN ('time', 'measure') AND ${table.rateUnitAmount} > 0)))`,
    ),
  ],
);

export const contractingMeasures = contractingSchema.table(
  'measure',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => contractingMachineAssignments.id, { onDelete: 'cascade' }),
    measureTypeId: uuid('measure_type_id')
      .notNull()
      .references(() => contractingMeasureTypes.id, { onDelete: 'restrict' }),
    quantity: money('quantity').notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex('measure_assignment_type_unique').on(table.assignmentId, table.measureTypeId),
    check('measure_quantity_positive', sql`${table.quantity} > 0`),
  ],
);

export const contractingChargeLines = contractingSchema.table(
  'charge_line',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => contractingJobs.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    amount: money('amount'),
    displayOrder: integer('display_order').notNull(),
    ...timestamps(),
  },
  (table) => [
    index('charge_line_job_idx').on(table.jobId),
    check('charge_line_description_not_blank', sql`length(btrim(${table.description})) > 0`),
    check('charge_line_amount_nonnegative', sql`${table.amount} IS NULL OR ${table.amount} >= 0`),
  ],
);

export const contractingJobsRelations = relations(contractingJobs, ({ many, one }) => ({
  assignments: many(contractingMachineAssignments),
  chargeLines: many(contractingChargeLines),
  customer: one(contractingCustomers, {
    fields: [contractingJobs.customerId],
    references: [contractingCustomers.id],
  }),
  farm: one(contractingFarms, {
    fields: [contractingJobs.farmId, contractingJobs.customerId],
    references: [contractingFarms.id, contractingFarms.customerId],
  }),
  foreman: one(user, { fields: [contractingJobs.foremanUserId], references: [user.id] }),
  workType: one(contractingWorkTypes, {
    fields: [contractingJobs.workTypeId],
    references: [contractingWorkTypes.id],
  }),
}));

export const contractingMachineAssignmentsRelations = relations(contractingMachineAssignments, ({ many, one }) => ({
  arrivalReading: one(contractingHourReadings, {
    fields: [contractingMachineAssignments.arrivalReadingId],
    references: [contractingHourReadings.id],
    relationName: 'assignmentArrivalReading',
  }),
  departureReading: one(contractingHourReadings, {
    fields: [contractingMachineAssignments.departureReadingId],
    references: [contractingHourReadings.id],
    relationName: 'assignmentDepartureReading',
  }),
  driver: one(user, {
    fields: [contractingMachineAssignments.driverUserId],
    references: [user.id],
  }),
  implement: one(contractingImplements, {
    fields: [contractingMachineAssignments.implementId],
    references: [contractingImplements.id],
  }),
  job: one(contractingJobs, {
    fields: [contractingMachineAssignments.jobId],
    references: [contractingJobs.id],
  }),
  machine: one(contractingMachines, {
    fields: [contractingMachineAssignments.machineId],
    references: [contractingMachines.id],
  }),
  measures: many(contractingMeasures),
}));

export const contractingMeasuresRelations = relations(contractingMeasures, ({ one }) => ({
  assignment: one(contractingMachineAssignments, {
    fields: [contractingMeasures.assignmentId],
    references: [contractingMachineAssignments.id],
  }),
  measureType: one(contractingMeasureTypes, {
    fields: [contractingMeasures.measureTypeId],
    references: [contractingMeasureTypes.id],
  }),
}));

export const contractingChargeLinesRelations = relations(contractingChargeLines, ({ one }) => ({
  job: one(contractingJobs, {
    fields: [contractingChargeLines.jobId],
    references: [contractingJobs.id],
  }),
}));
