import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  contractingCategories,
  contractingChargeLines,
  contractingCustomers,
  contractingFarms,
  contractingHourReadings,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
  contractingMeasures,
  contractingMeasureTypes,
  contractingWorkTypes,
} from '@pkg/db/contracting';
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { type JobReader, readableBy } from './job-readers.js';
import * as jobSql from './job-sql.js';

export type DbOrTx = Db | DatabaseTransaction;

export const foreman = alias(user, 'job_foreman');
export const invoicer = alias(user, 'job_invoicer');
const driver = alias(user, 'job_driver');
const arrivalReading = alias(contractingHourReadings, 'job_arrival_reading');
const departureReading = alias(contractingHourReadings, 'job_departure_reading');
const arrivalCapturer = alias(user, 'job_arrival_capturer');
const departureCapturer = alias(user, 'job_departure_capturer');
const arrivalAmender = alias(user, 'job_arrival_amender');
const departureAmender = alias(user, 'job_departure_amender');

/** A Job row with the names every read shows. A name added here needs its join in `selectJobs` and `listJobs`. */
export const jobHeader = {
  job: getTableColumns(contractingJobs),
  customerName: contractingCustomers.name,
  farmName: contractingFarms.name,
  workTypeName: contractingWorkTypes.name,
  foremanName: foreman.name,
  invoicedByName: invoicer.name,
};

// Plain joins rather than the relational API: Drizzle 0.45 keys relation types on the unqualified table
// name, so `contracting.job` and `equipment.job` collide.
/**
 * Jobs joined to everything `jobHeader` names; the caller adds its filter and order. `listJobs` repeats these
 * joins: its extra columns cannot pass through here without a cast (Drizzle cannot type a generic selection
 * across chained joins).
 */
export function selectJobs(db: DbOrTx) {
  return db
    .select(jobHeader)
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(
      contractingFarms,
      and(eq(contractingFarms.id, contractingJobs.farmId), eq(contractingFarms.customerId, contractingJobs.customerId)),
    )
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .leftJoin(foreman, eq(foreman.id, contractingJobs.foremanUserId))
    .leftJoin(invoicer, eq(invoicer.id, contractingJobs.invoicedByUserId));
}

/** Every stint on these Jobs with its Machine, Implement, Driver and readings, oldest plan first. */
export async function loadStints(db: DbOrTx, jobIds: readonly string[]) {
  if (!jobIds.length) return [];
  return db
    .select({
      stint: getTableColumns(contractingMachineAssignments),
      machineCode: contractingMachines.code,
      categoryName: contractingCategories.name,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
      implementCode: contractingImplements.code,
      driverName: driver.name,
      rateMeasureTypeName: contractingMeasureTypes.name,
      arrival: getTableColumns(arrivalReading),
      arrivalCapturedByName: arrivalCapturer.name,
      arrivalAmendedByName: arrivalAmender.name,
      departure: getTableColumns(departureReading),
      departureCapturedByName: departureCapturer.name,
      departureAmendedByName: departureAmender.name,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(contractingImplements, eq(contractingImplements.id, contractingMachineAssignments.implementId))
    .leftJoin(driver, eq(driver.id, contractingMachineAssignments.driverUserId))
    .leftJoin(contractingMeasureTypes, eq(contractingMeasureTypes.id, contractingMachineAssignments.rateMeasureTypeId))
    .leftJoin(arrivalReading, eq(arrivalReading.id, contractingMachineAssignments.arrivalReadingId))
    .leftJoin(arrivalCapturer, eq(arrivalCapturer.id, arrivalReading.capturedByUserId))
    .leftJoin(arrivalAmender, eq(arrivalAmender.id, arrivalReading.amendedBy))
    .leftJoin(departureReading, eq(departureReading.id, contractingMachineAssignments.departureReadingId))
    .leftJoin(departureCapturer, eq(departureCapturer.id, departureReading.capturedByUserId))
    .leftJoin(departureAmender, eq(departureAmender.id, departureReading.amendedBy))
    .where(inArray(contractingMachineAssignments.jobId, [...jobIds]))
    .orderBy(asc(contractingMachineAssignments.createdAt));
}
export type LoadedStint = Awaited<ReturnType<typeof loadStints>>[number];

/** The names a stint is shown with, for the detail and the field projection alike. */
export const stintNames = ({
  machineCode,
  categoryName,
  categoryIcon,
  categoryColour,
  implementCode,
  driverName,
}: LoadedStint) => ({ machineCode, categoryName, categoryIcon, categoryColour, implementCode, driverName });

const previousReading = alias(contractingHourReadings, 'job_previous_departure');
const previousAssignment = alias(contractingMachineAssignments, 'job_previous_assignment');
const previousDepartureOf = eq(
  previousReading.id,
  jobSql.previousDepartureId(contractingMachineAssignments.machineId, arrivalReading.sequence),
);

/** Each arrived stint's previous departure: the Machine's last departure before its arrival, where its Hour Gap starts. */
export async function loadPreviousDepartures(db: DbOrTx, jobId: string) {
  const rows = await db
    .select({
      id: contractingMachineAssignments.id,
      value: previousReading.value,
      capturedAt: previousReading.capturedAt,
    })
    .from(contractingMachineAssignments)
    .innerJoin(arrivalReading, eq(arrivalReading.id, contractingMachineAssignments.arrivalReadingId))
    .innerJoin(previousReading, previousDepartureOf)
    .where(eq(contractingMachineAssignments.jobId, jobId));
  return new Map(rows.map(({ id, ...departure }) => [id, departure] as const));
}

/** The Job each arrived stint's Machine left before arriving, by stint id: only those the reader could open. */
export async function loadPreviousJobs(db: DbOrTx, jobId: string, reader: JobReader) {
  const rows = await db
    .select({
      id: contractingMachineAssignments.id,
      code: contractingJobs.code,
      status: contractingJobs.status,
      customerName: contractingCustomers.name,
      farmName: contractingFarms.name,
    })
    .from(contractingMachineAssignments)
    .innerJoin(arrivalReading, eq(arrivalReading.id, contractingMachineAssignments.arrivalReadingId))
    .innerJoin(previousReading, previousDepartureOf)
    .innerJoin(previousAssignment, eq(previousAssignment.departureReadingId, previousReading.id))
    .innerJoin(contractingJobs, and(eq(contractingJobs.id, previousAssignment.jobId), readableBy(reader)))
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(
      contractingFarms,
      and(eq(contractingFarms.id, contractingJobs.farmId), eq(contractingFarms.customerId, contractingJobs.customerId)),
    )
    .where(eq(contractingMachineAssignments.jobId, jobId));
  return new Map(rows.map(({ id, ...job }) => [id, job] as const));
}

export function loadMeasures(db: DbOrTx, jobId: string) {
  return db
    .select({
      id: contractingMeasures.id,
      assignmentId: contractingMeasures.assignmentId,
      measureTypeId: contractingMeasures.measureTypeId,
      measureTypeName: contractingMeasureTypes.name,
      quantity: contractingMeasures.quantity,
    })
    .from(contractingMeasures)
    .innerJoin(contractingMachineAssignments, eq(contractingMachineAssignments.id, contractingMeasures.assignmentId))
    .innerJoin(contractingMeasureTypes, eq(contractingMeasureTypes.id, contractingMeasures.measureTypeId))
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .orderBy(asc(contractingMeasureTypes.displayOrder));
}
export type LoadedMeasure = Awaited<ReturnType<typeof loadMeasures>>[number];

export function loadChargeLines(db: DbOrTx, jobId: string) {
  return db
    .select()
    .from(contractingChargeLines)
    .where(eq(contractingChargeLines.jobId, jobId))
    .orderBy(asc(contractingChargeLines.displayOrder));
}
