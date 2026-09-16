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
import { deriveStintHours, formatJobNumber, looksFinished } from '@pkg/domain/contracting';
import { Assignment, FieldReading, JobDetail, type JobQueue, JobSummary } from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { jobNotFound } from './job-errors.js';

const arrivalReading = alias(contractingHourReadings, 'assignment_arrival');
const departureReading = alias(contractingHourReadings, 'assignment_departure');

function mapFieldReading(row: typeof contractingHourReadings.$inferSelect | null) {
  if (!row) return null;
  return FieldReading.parse({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    photoBacked: row.photo !== null,
  });
}

async function loadJobBase(db: Db | DatabaseTransaction, condition: ReturnType<typeof eq>) {
  const [row] = await db
    .select({
      job: getTableColumns(contractingJobs),
      customerName: contractingCustomers.name,
      farmName: contractingFarms.name,
      workTypeName: contractingWorkTypes.name,
      foremanName: user.name,
    })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(contractingFarms, eq(contractingFarms.id, contractingJobs.farmId))
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .leftJoin(user, eq(user.id, contractingJobs.foremanUserId))
    .where(condition);
  return row;
}

async function loadAssignments(db: Db | DatabaseTransaction, jobId: string) {
  const rows = await db
    .select({
      assignment: getTableColumns(contractingMachineAssignments),
      machineCode: contractingMachines.code,
      categoryName: contractingCategories.name,
      categoryIcon: contractingCategories.icon,
      categoryColour: contractingCategories.colour,
      implementCode: contractingImplements.code,
      driverName: user.name,
      arrival: getTableColumns(arrivalReading),
      departure: getTableColumns(departureReading),
      previousDepartureValue: sql<number | null>`(
        select previous.value
        from contracting.hour_reading previous
        where previous.machine_id = ${contractingMachineAssignments.machineId}
          and previous.role = 'departure'
          and previous.sequence < (
            select current.sequence from contracting.hour_reading current
            where current.id = ${contractingMachineAssignments.arrivalReadingId}
          )
        order by previous.sequence desc
        limit 1
      )`,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(contractingImplements, eq(contractingImplements.id, contractingMachineAssignments.implementId))
    .leftJoin(user, eq(user.id, contractingMachineAssignments.driverUserId))
    .leftJoin(arrivalReading, eq(arrivalReading.id, contractingMachineAssignments.arrivalReadingId))
    .leftJoin(departureReading, eq(departureReading.id, contractingMachineAssignments.departureReadingId))
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .orderBy(asc(arrivalReading.capturedAt), asc(contractingMachineAssignments.createdAt));

  const assignmentIds = rows.map((row) => row.assignment.id);
  const measureRows = assignmentIds.length
    ? await db
        .select({
          measure: getTableColumns(contractingMeasures),
          measureTypeName: contractingMeasureTypes.name,
        })
        .from(contractingMeasures)
        .innerJoin(contractingMeasureTypes, eq(contractingMeasureTypes.id, contractingMeasures.measureTypeId))
        .where(inArray(contractingMeasures.assignmentId, assignmentIds))
        .orderBy(asc(contractingMeasureTypes.displayOrder))
    : [];
  const measuresByAssignment = new Map<string, (typeof measureRows)[number][]>();
  for (const measure of measureRows) {
    const group = measuresByAssignment.get(measure.measure.assignmentId) ?? [];
    group.push(measure);
    measuresByAssignment.set(measure.measure.assignmentId, group);
  }

  return rows.map((row) => {
    const arrival = mapFieldReading(row.arrival);
    const departure = mapFieldReading(row.departure);
    const gapResolved = row.assignment.gapResolvedAt !== null;
    const derived = deriveStintHours({
      arrival,
      departure,
      previousDeparture: row.previousDepartureValue === null ? null : { value: Number(row.previousDepartureValue) },
      travelIncluded: row.assignment.travelIncluded,
      gap: gapResolved
        ? {
            travelHours: row.assignment.gapTravelHours ?? 0,
            unaccountedHours: row.assignment.gapUnaccountedHours ?? 0,
          }
        : null,
    });
    const assignment = Assignment.parse({
      ...row.assignment,
      machineCode: row.machineCode,
      categoryName: row.categoryName,
      categoryIcon: row.categoryIcon,
      categoryColour: row.categoryColour,
      implementCode: row.implementCode,
      driverName: row.driverName,
      arrival,
      departure,
      ...derived,
      gapResolved,
      measures: (measuresByAssignment.get(row.assignment.id) ?? []).map(({ measure, measureTypeName }) => ({
        ...measure,
        measureTypeName,
      })),
    });
    return {
      assignment,
      needsALook: Number(readingNeedsALook(row.arrival)) + Number(readingNeedsALook(row.departure)),
    };
  });
}

function readingNeedsALook(
  reading: Pick<
    typeof contractingHourReadings.$inferSelect,
    'disputed' | 'evidenceReviewedAt' | 'aiVerification'
  > | null,
) {
  return (
    !!reading &&
    (reading.disputed ||
      (reading.evidenceReviewedAt === null &&
        ['pending', 'disagrees', 'low-confidence'].includes(reading.aiVerification)))
  );
}

export async function getJob({ db, id, code }: { db: Db | DatabaseTransaction; id?: string; code?: string }) {
  const numericCode = code ? Number(code.slice('CJOB-'.length)) : undefined;
  const base = await loadJobBase(
    db,
    id ? eq(contractingJobs.id, id) : eq(contractingJobs.code, numericCode ?? Number.NaN),
  );
  if (!base) throw jobNotFound();
  const assignmentRows = await loadAssignments(db, base.job.id);
  const assignments = assignmentRows.map((row) => row.assignment);
  const chargeLines = await db
    .select()
    .from(contractingChargeLines)
    .where(eq(contractingChargeLines.jobId, base.job.id))
    .orderBy(asc(contractingChargeLines.displayOrder));
  const states = assignments.map((assignment) => assignment.state);
  const openGapFlags = assignments.filter((assignment) => assignment.gapFlag).length;
  const needsALook = openGapFlags + assignmentRows.reduce((count, row) => count + row.needsALook, 0);
  return JobDetail.parse({
    ...base.job,
    customerName: base.customerName,
    farmName: base.farmName,
    workTypeName: base.workTypeName,
    foremanName: base.foremanName,
    jobNumber: formatJobNumber(base.job.code),
    plannedStints: states.filter((state) => state === 'planned').length,
    onSiteStints: states.filter((state) => state === 'on-site').length,
    leftStints: states.filter((state) => state === 'left').length,
    looksFinished: looksFinished(base.job, states),
    openGapFlags,
    needsALook,
    createdAt: base.job.createdAt.toISOString(),
    updatedAt: base.job.updatedAt.toISOString(),
    completedAt: base.job.completedAt?.toISOString() ?? null,
    pricedAt: base.job.pricedAt?.toISOString() ?? null,
    invoicedAt: base.job.invoicedAt?.toISOString() ?? null,
    assignments,
    chargeLines,
  });
}

export async function listJobs({ db, queue, foremanUserId }: { db: Db; queue: JobQueue; foremanUserId?: string }) {
  const candidateStatuses =
    queue === 'looks-finished'
      ? (['active'] as const)
      : queue === 'awaiting-pricing'
        ? (['completed'] as const)
        : queue === 'awaiting-invoice'
          ? (['priced'] as const)
          : ([queue] as const);
  const rows = await db
    .select({ id: contractingJobs.id })
    .from(contractingJobs)
    .where(
      and(
        inArray(contractingJobs.status, candidateStatuses),
        foremanUserId ? eq(contractingJobs.foremanUserId, foremanUserId) : undefined,
        foremanUserId ? inArray(contractingJobs.status, ['upcoming', 'active', 'completed']) : undefined,
      ),
    )
    .orderBy(asc(contractingJobs.code));
  const details = await Promise.all(rows.map(({ id }) => getJob({ db, id })));
  return details.filter((job) => queue !== 'looks-finished' || job.looksFinished).map((job) => JobSummary.parse(job));
}

export function redactMoney(job: ReturnType<typeof JobDetail.parse>) {
  return JobDetail.parse({
    ...job,
    dieselUnitPrice: null,
    dieselAmount: null,
    discountKind: null,
    discountValue: null,
    discountAmount: null,
    pricedSubtotal: null,
    pricedTotal: null,
    assignments: job.assignments.map((assignment) => ({
      ...assignment,
      rateId: null,
      rateName: null,
      rateBasis: null,
      rateMeasureTypeId: null,
      rateUnitAmount: null,
      computedAmount: null,
      finalAmount: null,
    })),
    chargeLines: job.chargeLines.map((line) => ({ ...line, amount: null })),
  });
}

export async function listForemen({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.contractingRole, 'foreman'))
    .orderBy(asc(user.name));
}
