import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  type contractingCategories,
  contractingChargeLines,
  type contractingCustomers,
  type contractingFarms,
  type contractingHourReadings,
  type contractingImplements,
  contractingJobs,
  contractingMachineAssignments,
  type contractingMachines,
  type contractingMeasures,
  type contractingMeasureTypes,
  type contractingWorkTypes,
} from '@pkg/db/contracting';
import { deriveStintHours, formatJobNumber, looksFinished } from '@pkg/domain/contracting';
import { Assignment, FieldReading, JobDetail, type JobQueue, JobSummary } from '@pkg/schema/contracting';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { jobNotFound } from './job-errors.js';

function mapFieldReading(row: typeof contractingHourReadings.$inferSelect | null) {
  if (!row) return null;
  return FieldReading.parse({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    photoBacked: row.photo !== null,
  });
}

async function loadJob(db: Db | DatabaseTransaction, condition: ReturnType<typeof eq>) {
  const query = db.query.contractingJobs;
  const findFirst = query.findFirst as unknown as (config: unknown) => Promise<LoadedJob | undefined>;
  return findFirst.call(query, {
    where: condition,
    with: {
      assignments: {
        extras: {
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
          )`.as('previous_departure_value'),
        },
        orderBy: [asc(contractingMachineAssignments.createdAt)],
        with: {
          arrivalReading: true,
          departureReading: true,
          driver: true,
          implement: true,
          machine: { with: { category: true } },
          measures: { with: { measureType: true } },
        },
      },
      chargeLines: { orderBy: [asc(contractingChargeLines.displayOrder)] },
      customer: true,
      farm: true,
      foreman: true,
      workType: true,
    },
  });
}

type LoadedAssignment = typeof contractingMachineAssignments.$inferSelect & {
  arrivalReading: typeof contractingHourReadings.$inferSelect | null;
  departureReading: typeof contractingHourReadings.$inferSelect | null;
  driver: typeof user.$inferSelect | null;
  implement: typeof contractingImplements.$inferSelect | null;
  machine: typeof contractingMachines.$inferSelect & { category: typeof contractingCategories.$inferSelect };
  measures: Array<
    typeof contractingMeasures.$inferSelect & { measureType: typeof contractingMeasureTypes.$inferSelect }
  >;
  previousDepartureValue: number | null;
};

type LoadedJob = typeof contractingJobs.$inferSelect & {
  assignments: LoadedAssignment[];
  chargeLines: (typeof contractingChargeLines.$inferSelect)[];
  customer: typeof contractingCustomers.$inferSelect;
  farm: typeof contractingFarms.$inferSelect;
  foreman: typeof user.$inferSelect | null;
  workType: typeof contractingWorkTypes.$inferSelect;
};

function mapAssignment(row: LoadedJob['assignments'][number]) {
  const arrival = mapFieldReading(row.arrivalReading);
  const departure = mapFieldReading(row.departureReading);
  const gapResolved = row.gapResolvedAt !== null;
  const derived = deriveStintHours({
    arrival,
    departure,
    previousDeparture: row.previousDepartureValue === null ? null : { value: Number(row.previousDepartureValue) },
    travelIncluded: row.travelIncluded,
    gap: gapResolved
      ? {
          travelHours: row.gapTravelHours ?? 0,
          unaccountedHours: row.gapUnaccountedHours ?? 0,
        }
      : null,
  });
  const assignment = Assignment.parse({
    ...row,
    machineCode: row.machine.code,
    categoryName: row.machine.category.name,
    categoryIcon: row.machine.category.icon,
    categoryColour: row.machine.category.colour,
    implementCode: row.implement?.code ?? null,
    driverName: row.driver?.name ?? null,
    arrival,
    departure,
    ...derived,
    gapResolved,
    measures: [...row.measures]
      .sort((left, right) => left.measureType.displayOrder - right.measureType.displayOrder)
      .map(({ measureType, ...measure }) => ({ ...measure, measureTypeName: measureType.name })),
  });
  return {
    assignment,
    needsALook: Number(readingNeedsALook(row.arrivalReading)) + Number(readingNeedsALook(row.departureReading)),
  };
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
  const row = await loadJob(db, id ? eq(contractingJobs.id, id) : eq(contractingJobs.code, numericCode ?? Number.NaN));
  if (!row) throw jobNotFound();
  const { assignments: rawAssignments, chargeLines, customer, farm, foreman, workType, ...job } = row;
  const assignmentRows = rawAssignments
    .sort((left, right) => {
      const leftArrival = left.arrivalReading?.capturedAt.getTime() ?? Number.POSITIVE_INFINITY;
      const rightArrival = right.arrivalReading?.capturedAt.getTime() ?? Number.POSITIVE_INFINITY;
      return leftArrival - rightArrival || left.createdAt.getTime() - right.createdAt.getTime();
    })
    .map(mapAssignment);
  const assignments = assignmentRows.map((row) => row.assignment);
  const states = assignments.map((assignment) => assignment.state);
  const openGapFlags = assignments.filter((assignment) => assignment.gapFlag).length;
  const needsALook = openGapFlags + assignmentRows.reduce((count, row) => count + row.needsALook, 0);
  return JobDetail.parse({
    ...job,
    customerName: customer.name,
    farmName: farm.name,
    workTypeName: workType.name,
    foremanName: foreman?.name ?? null,
    jobNumber: formatJobNumber(job.code),
    plannedStints: states.filter((state) => state === 'planned').length,
    onSiteStints: states.filter((state) => state === 'on-site').length,
    leftStints: states.filter((state) => state === 'left').length,
    looksFinished: looksFinished(job, states),
    openGapFlags,
    needsALook,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    pricedAt: job.pricedAt?.toISOString() ?? null,
    invoicedAt: job.invoicedAt?.toISOString() ?? null,
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
