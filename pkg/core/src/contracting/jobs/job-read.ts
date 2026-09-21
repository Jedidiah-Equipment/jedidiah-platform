import { type DatabaseTransaction, type Db, user } from '@pkg/db';
import {
  contractingChargeLines,
  contractingCustomers,
  contractingFarms,
  type contractingHourReadings,
  contractingJobs,
  contractingMachineAssignments,
  contractingWorkTypes,
} from '@pkg/db/contracting';
import { deriveStintHours, formatJobNumber, looksFinished, meterDisagreementHint } from '@pkg/domain/contracting';
import {
  Assignment,
  JobDetail,
  type JobQueue,
  JobQueueCounts,
  JobReading,
  type JobStatus,
  JobSummary,
} from '@pkg/schema/contracting';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { assertOwner, JobError, jobNotFound } from './job-errors.js';

type LoadedReading = (typeof contractingHourReadings.$inferSelect & { capturedBy: { name: string } | null }) | null;

function readingAttention(row: LoadedReading) {
  if (!row) return [];
  const kinds: Array<'disputed' | 'ai-pending' | 'ai-disagrees' | 'ai-low-confidence' | 'missing-photo'> = [];
  if (row.disputed) kinds.push('disputed');
  if (row.evidenceReviewedAt === null) {
    if (row.aiVerification === 'pending') kinds.push('ai-pending');
    if (row.aiVerification === 'disagrees') kinds.push('ai-disagrees');
    if (row.aiVerification === 'low-confidence') kinds.push('ai-low-confidence');
  }
  // Missing photo belongs in sign-off's strip, but does not count toward the queue's needsALook total.
  if (row.photo === null) kinds.push('missing-photo');
  return kinds;
}

function mapJobReading(row: LoadedReading) {
  if (!row) return null;
  return JobReading.parse({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    evidenceReviewedAt: row.evidenceReviewedAt?.toISOString() ?? null,
    amendedAt: row.amendedAt?.toISOString() ?? null,
    aiHint: meterDisagreementHint(row),
    photoBacked: row.photo !== null,
    capturedByName: row.capturedBy?.name ?? null,
    needsALook: readingAttention(row),
  });
}

async function loadJob(db: Db | DatabaseTransaction, condition: ReturnType<typeof eq>) {
  const query = db.query.contractingJobs;
  const findFirst = query.findFirst as unknown as (config: unknown) => Promise<LoadedJob | undefined>;
  const row = await findFirst.call(query, {
    where: condition,
    with: {
      assignments: {
        extras: {
          previousDepartureValue: sql<string | null>`(
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
          arrivalReading: { with: { capturedBy: true } },
          departureReading: { with: { capturedBy: true } },
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
  assertLoadedJob(row);
  return row;
}

type LoadedJob = typeof contractingJobs.$inferSelect & {
  assignments: Array<
    typeof contractingMachineAssignments.$inferSelect & {
      arrivalReading: LoadedReading;
      departureReading: LoadedReading;
      driver: typeof user.$inferSelect | null;
      implement: { code: string } | null;
      machine: { code: string; category: { name: string; icon: string; colour: string } };
      measures: Array<
        { measureTypeId: string; measureType: { name: string; displayOrder: number } } & Record<string, unknown>
      >;
      previousDepartureValue: number | string | null;
    }
  >;
  chargeLines: (typeof contractingChargeLines.$inferSelect)[];
  customer: { name: string };
  farm: { name: string };
  foreman: { name: string } | null;
  workType: { name: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertLoadedJob(row: unknown): asserts row is LoadedJob | undefined {
  if (row === undefined) return;
  if (
    !isRecord(row) ||
    !Array.isArray(row.assignments) ||
    !Array.isArray(row.chargeLines) ||
    !isRecord(row.customer) ||
    !isRecord(row.farm) ||
    !isRecord(row.workType)
  )
    throw new Error('Contracting Job query returned an invalid relation shape.');
  for (const assignment of row.assignments) {
    if (
      !isRecord(assignment) ||
      !isRecord(assignment.machine) ||
      !isRecord(assignment.machine.category) ||
      !Array.isArray(assignment.measures) ||
      !Object.hasOwn(assignment, 'previousDepartureValue') ||
      (assignment.previousDepartureValue !== null &&
        typeof assignment.previousDepartureValue !== 'string' &&
        typeof assignment.previousDepartureValue !== 'number')
    )
      throw new Error('Contracting Machine Assignment query returned an invalid relation shape.');
  }
}

function mapAssignment(row: LoadedJob['assignments'][number]) {
  const arrival = mapJobReading(row.arrivalReading);
  const departure = mapJobReading(row.departureReading);
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
    createdAt: row.createdAt.toISOString(),
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

export async function getReadableJob({
  db,
  actorUserId,
  mode,
  id,
  code,
}: {
  db: Db;
  actorUserId: string;
  mode: 'all' | 'own' | 'priced';
  id?: string;
  code?: string;
}) {
  const job = await getJob({ db, ...(id === undefined ? {} : { id }), ...(code === undefined ? {} : { code }) });
  if (mode === 'own') {
    assertOwner(job, actorUserId);
    if (!['upcoming', 'active', 'completed'].includes(job.status))
      throw new JobError('contracting_job.not_owner', 'Foremen can only view their open and completed Jobs.');
    return redactMoney(job);
  }
  if (mode === 'priced' && !['completed', 'priced', 'invoiced'].includes(job.status))
    throw new JobError('contracting_job.not_owner', 'Invoicing can only view Completed, Priced, or Invoiced Jobs.');
  return job;
}

const plannedStints = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.arrival_reading_id is null
)`;
const onSiteStints = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.arrival_reading_id is not null
    and summary_assignment.departure_reading_id is null
)`;
const leftStints = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.departure_reading_id is not null
)`;
const openGapFlags = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  join contracting.hour_reading summary_arrival
    on summary_arrival.id = summary_assignment.arrival_reading_id
  where summary_assignment.job_id = ${contractingJobs.id}
    and summary_assignment.gap_resolved_at is null
    and summary_arrival.value - (
      select previous.value
      from contracting.hour_reading previous
      where previous.machine_id = summary_assignment.machine_id
        and previous.role = 'departure'
        and previous.sequence < summary_arrival.sequence
      order by previous.sequence desc
      limit 1
    ) > 4
)`;
const readingsNeedingALook = sql<number>`(
  select count(*)::integer
  from contracting.machine_assignment summary_assignment
  join contracting.hour_reading summary_reading
    on summary_reading.id = summary_assignment.arrival_reading_id
    or summary_reading.id = summary_assignment.departure_reading_id
  where summary_assignment.job_id = ${contractingJobs.id}
    and (
      summary_reading.disputed
      or (
        summary_reading.evidence_reviewed_at is null
        and summary_reading.ai_verification in ('pending', 'disagrees', 'low-confidence')
      )
    )
)`;
const looksFinishedInSql = sql<boolean>`(
  ${contractingJobs.status} = 'active'
  and ${leftStints} > 0
  and ${onSiteStints} = 0
)`;

export async function countJobQueues({ db, foremanUserId }: { db: Db; foremanUserId?: string }) {
  const rows = await db
    .select({
      status: contractingJobs.status,
      looksFinished: looksFinishedInSql,
      count: sql<number>`count(*)::integer`,
    })
    .from(contractingJobs)
    .where(
      and(
        foremanUserId ? eq(contractingJobs.foremanUserId, foremanUserId) : undefined,
        foremanUserId ? inArray(contractingJobs.status, ['upcoming', 'active', 'completed']) : undefined,
      ),
    )
    .groupBy(contractingJobs.status, looksFinishedInSql);
  const count = (status: JobStatus, finished?: boolean) =>
    rows
      .filter((row) => row.status === status && (finished === undefined || row.looksFinished === finished))
      .reduce((total, row) => total + row.count, 0);
  return JobQueueCounts.parse({
    upcoming: count('upcoming'),
    active: count('active'),
    'looks-finished': count('active', true),
    'awaiting-pricing': count('completed'),
    'awaiting-invoice': count('priced'),
    invoiced: count('invoiced'),
    cancelled: count('cancelled'),
  });
}

export async function hasActiveJobAttention({ db, foremanUserId }: { db: Db; foremanUserId?: string }) {
  const rows = await db
    .select({ id: contractingJobs.id })
    .from(contractingJobs)
    .where(
      and(
        eq(contractingJobs.status, 'active'),
        foremanUserId ? eq(contractingJobs.foremanUserId, foremanUserId) : undefined,
        sql`${openGapFlags} + ${readingsNeedingALook} > 0`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function listJobs({
  db,
  queue,
  limit,
  offset,
  foremanUserId,
}: {
  db: Db;
  queue: JobQueue;
  limit: number;
  offset: number;
  foremanUserId?: string;
}) {
  const candidateStatuses =
    queue === 'looks-finished'
      ? (['active'] as const)
      : queue === 'awaiting-pricing'
        ? (['completed'] as const)
        : queue === 'awaiting-invoice'
          ? (['priced'] as const)
          : ([queue] as const);
  return db
    .select({
      id: contractingJobs.id,
      code: contractingJobs.code,
      jobNumber: sql<string>`'CJOB-' || lpad(${contractingJobs.code}::text, 5, '0')`,
      customerId: contractingJobs.customerId,
      customerName: contractingCustomers.name,
      farmId: contractingJobs.farmId,
      farmName: contractingFarms.name,
      workTypeId: contractingJobs.workTypeId,
      workTypeName: contractingWorkTypes.name,
      description: contractingJobs.description,
      foremanUserId: contractingJobs.foremanUserId,
      foremanName: user.name,
      status: contractingJobs.status,
      plannedStints,
      onSiteStints,
      leftStints,
      looksFinished: looksFinishedInSql,
      openGapFlags,
      needsALook: sql<number>`${openGapFlags} + ${readingsNeedingALook}`,
      startDate: contractingJobs.startDate,
      endDate: contractingJobs.endDate,
      createdAt: contractingJobs.createdAt,
      updatedAt: contractingJobs.updatedAt,
    })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(
      contractingFarms,
      and(eq(contractingFarms.id, contractingJobs.farmId), eq(contractingFarms.customerId, contractingJobs.customerId)),
    )
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .leftJoin(user, eq(user.id, contractingJobs.foremanUserId))
    .where(
      and(
        inArray(contractingJobs.status, candidateStatuses),
        queue === 'looks-finished' ? looksFinishedInSql : undefined,
        foremanUserId ? eq(contractingJobs.foremanUserId, foremanUserId) : undefined,
        foremanUserId ? inArray(contractingJobs.status, ['upcoming', 'active', 'completed']) : undefined,
      ),
    )
    .orderBy(asc(contractingJobs.code))
    .limit(limit)
    .offset(offset)
    .then((rows) =>
      rows.map((row) =>
        JobSummary.parse({
          ...row,
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        }),
      ),
    );
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
