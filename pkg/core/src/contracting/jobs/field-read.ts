import { type Db, user } from '@pkg/db';
import {
  contractingCategories,
  contractingCustomers,
  contractingFarms,
  contractingHourReadings,
  contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  contractingMachines,
  contractingWorkTypes,
} from '@pkg/db/contracting';
import { assignmentState, fieldJobAccessMode, formatJobNumber } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import { FieldDriver, FieldJob, FieldReading, FieldStint } from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { JobError, jobNotFound } from './job-errors.js';

function fieldReadMode(actor: UserAccessSummary): 'all' | 'own' {
  const mode = fieldJobAccessMode(actor);
  if (mode) return mode;
  throw new JobError('contracting_job.not_owner', 'You do not have access to field Jobs.');
}

function mapReading(reading: typeof contractingHourReadings.$inferSelect | null) {
  return reading
    ? FieldReading.parse({
        ...reading,
        capturedAt: reading.capturedAt.toISOString(),
        photoBacked: reading.photo !== null,
      })
    : null;
}

const arrivalReadings = alias(contractingHourReadings, 'field_arrival_reading');
const departureReadings = alias(contractingHourReadings, 'field_departure_reading');

async function loadFieldJobs(db: Db, where: ReturnType<typeof and>) {
  const jobs = await db
    .select({
      job: getTableColumns(contractingJobs),
      customerName: contractingCustomers.name,
      farmName: contractingFarms.name,
      workTypeName: contractingWorkTypes.name,
    })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .where(where)
    .orderBy(asc(contractingJobs.code));
  const stints = jobs.length
    ? await db
        .select({
          stint: getTableColumns(contractingMachineAssignments),
          machineCode: contractingMachines.code,
          categoryName: contractingCategories.name,
          categoryIcon: contractingCategories.icon,
          categoryColour: contractingCategories.colour,
          implementCode: contractingImplements.code,
          driverName: user.name,
          arrivalReading: getTableColumns(arrivalReadings),
          departureReading: getTableColumns(departureReadings),
        })
        .from(contractingMachineAssignments)
        .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
        .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
        .leftJoin(contractingImplements, eq(contractingImplements.id, contractingMachineAssignments.implementId))
        .leftJoin(user, eq(user.id, contractingMachineAssignments.driverUserId))
        .leftJoin(arrivalReadings, eq(arrivalReadings.id, contractingMachineAssignments.arrivalReadingId))
        .leftJoin(departureReadings, eq(departureReadings.id, contractingMachineAssignments.departureReadingId))
        .where(
          inArray(
            contractingMachineAssignments.jobId,
            jobs.map((row) => row.job.id),
          ),
        )
        .orderBy(asc(contractingMachineAssignments.createdAt))
    : [];
  const stintsByJob = new Map<string, typeof stints>();
  for (const row of stints) {
    const jobStints = stintsByJob.get(row.stint.jobId) ?? [];
    jobStints.push(row);
    stintsByJob.set(row.stint.jobId, jobStints);
  }
  return jobs.map((row) => ({ ...row, stints: stintsByJob.get(row.job.id) ?? [] }));
}

type LoadedFieldJob = Awaited<ReturnType<typeof loadFieldJobs>>[number];

function mapFieldJob(row: LoadedFieldJob) {
  return FieldJob.parse({
    ...row.job,
    jobNumber: formatJobNumber(row.job.code),
    customerName: row.customerName,
    farmName: row.farmName,
    workTypeName: row.workTypeName,
    stints: row.stints.map((row) =>
      FieldStint.parse({
        ...row.stint,
        machineCode: row.machineCode,
        categoryName: row.categoryName,
        categoryIcon: row.categoryIcon,
        categoryColour: row.categoryColour,
        implementCode: row.implementCode,
        driverName: row.driverName,
        state: assignmentState(row.stint),
        arrival: mapReading(row.arrivalReading),
        departure: mapReading(row.departureReading),
        createdAt: row.stint.createdAt.toISOString(),
      }),
    ),
  });
}

export async function listFieldJobs({ db, actor }: { db: Db; actor: UserAccessSummary }) {
  const mode = fieldReadMode(actor);
  const rows = await loadFieldJobs(
    db,
    and(
      inArray(contractingJobs.status, ['upcoming', 'active']),
      mode === 'own' ? eq(contractingJobs.foremanUserId, actor.userId) : undefined,
    ),
  );
  return rows.map(mapFieldJob);
}

export async function getFieldJob({ db, actor, id }: { db: Db; actor: UserAccessSummary; id: string }) {
  const mode = fieldReadMode(actor);
  const [row] = await loadFieldJobs(db, eq(contractingJobs.id, id));
  if (!row) throw jobNotFound();
  if (mode === 'own' && row.job.foremanUserId !== actor.userId)
    throw new JobError('contracting_job.not_owner', 'This Job is assigned to another Foreman.');
  if (!['upcoming', 'active'].includes(row.job.status))
    throw new JobError('contracting_job.wrong_status', 'This Job is no longer open.');
  return mapFieldJob(row);
}

export async function listFieldDrivers({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'driver'), eq(user.isDevice, false)))
    .orderBy(asc(user.name))
    .then((rows) => rows.map((row) => FieldDriver.parse(row)));
}
