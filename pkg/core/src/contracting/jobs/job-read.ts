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
import { JOHANNESBURG_TIME_ZONE } from '@pkg/domain';
import {
  canMarkPriced,
  computeDieselAmount,
  computeJobTotals,
  deriveJobActions,
  deriveStintHours,
  formatJobNumber,
  isAiFlaggedVerification,
  type JobActor,
  type JobReadMode,
  jobReadMode,
  jobReadSeesMoney,
  jobReadStatuses,
  looksFinished,
  meterDisagreementHint,
  parseJobNumber,
  priceStint,
} from '@pkg/domain/contracting';
import {
  Assignment,
  type ChargeLine,
  hasJobStatus,
  JobDetail,
  JobFacts,
  type JobQueue,
  JobQueueCounts,
  JobReading,
  type JobStatus,
  JobSummary,
  jobQueues,
} from '@pkg/schema/contracting';
import { and, asc, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { assertOwner, JobError, jobNotFound } from './job-errors.js';
import * as jobSql from './job-sql.js';

type DbOrTx = Db | DatabaseTransaction;
export type JobLookup = { id: string } | { code: string };
/** Who is reading Jobs, and through which read mode. */
type JobReader = { mode: JobReadMode; actorUserId: string };

/** The read mode a person reads Jobs through; one with no Job read permission is refused. */
function readerFor(actor: JobActor): JobReader {
  const mode = jobReadMode(actor);
  if (!mode) throw new JobError('contracting_job.forbidden', 'You do not have permission to view Jobs.');
  return { mode, actorUserId: actor.userId };
}

// Plain joins rather than the relational API: Drizzle 0.45 keys relation types on the unqualified table
// name, so `contracting.job` and `equipment.job` collide and `@pkg/db` erases the contracting relation types.
const foreman = alias(user, 'job_foreman');
const invoicer = alias(user, 'job_invoicer');
const driver = alias(user, 'job_driver');
const arrivalReading = alias(contractingHourReadings, 'job_arrival_reading');
const departureReading = alias(contractingHourReadings, 'job_departure_reading');
const arrivalCapturer = alias(user, 'job_arrival_capturer');
const departureCapturer = alias(user, 'job_departure_capturer');

async function loadJob(db: DbOrTx, lookup: JobLookup) {
  const [row] = await db
    .select({
      job: getTableColumns(contractingJobs),
      customerName: contractingCustomers.name,
      farmName: contractingFarms.name,
      workTypeName: contractingWorkTypes.name,
      foremanName: foreman.name,
      invoicedByName: invoicer.name,
    })
    .from(contractingJobs)
    .innerJoin(contractingCustomers, eq(contractingCustomers.id, contractingJobs.customerId))
    .innerJoin(
      contractingFarms,
      and(eq(contractingFarms.id, contractingJobs.farmId), eq(contractingFarms.customerId, contractingJobs.customerId)),
    )
    .innerJoin(contractingWorkTypes, eq(contractingWorkTypes.id, contractingJobs.workTypeId))
    .leftJoin(foreman, eq(foreman.id, contractingJobs.foremanUserId))
    .leftJoin(invoicer, eq(invoicer.id, contractingJobs.invoicedByUserId))
    .where('id' in lookup ? eq(contractingJobs.id, lookup.id) : eq(contractingJobs.code, parseJobNumber(lookup.code)));
  if (!row) throw jobNotFound();
  const [assignments, measures, chargeLines] = await Promise.all([
    loadAssignments(db, row.job.id),
    loadMeasures(db, row.job.id),
    db
      .select()
      .from(contractingChargeLines)
      .where(eq(contractingChargeLines.jobId, row.job.id))
      .orderBy(asc(contractingChargeLines.displayOrder)),
  ]);
  return { ...row, assignments, measures, chargeLines };
}

function loadAssignments(db: DbOrTx, jobId: string) {
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
      departure: getTableColumns(departureReading),
      departureCapturedByName: departureCapturer.name,
      previousDepartureValue: sql<
        number | string | null
      >`${jobSql.previousDepartureValue(contractingMachineAssignments.machineId, arrivalReading.sequence)}`,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .innerJoin(contractingCategories, eq(contractingCategories.id, contractingMachines.categoryId))
    .leftJoin(contractingImplements, eq(contractingImplements.id, contractingMachineAssignments.implementId))
    .leftJoin(driver, eq(driver.id, contractingMachineAssignments.driverUserId))
    .leftJoin(contractingMeasureTypes, eq(contractingMeasureTypes.id, contractingMachineAssignments.rateMeasureTypeId))
    .leftJoin(arrivalReading, eq(arrivalReading.id, contractingMachineAssignments.arrivalReadingId))
    .leftJoin(arrivalCapturer, eq(arrivalCapturer.id, arrivalReading.capturedByUserId))
    .leftJoin(departureReading, eq(departureReading.id, contractingMachineAssignments.departureReadingId))
    .leftJoin(departureCapturer, eq(departureCapturer.id, departureReading.capturedByUserId))
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .orderBy(asc(contractingMachineAssignments.createdAt));
}

function loadMeasures(db: DbOrTx, jobId: string) {
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

type LoadedJob = Awaited<ReturnType<typeof loadJob>>;
type LoadedAssignment = LoadedJob['assignments'][number];
type LoadedMeasure = LoadedJob['measures'][number];
type LoadedReading = typeof contractingHourReadings.$inferSelect;

function readingAttention(row: LoadedReading): JobReading['needsALook'] {
  const kinds: JobReading['needsALook'] = [];
  if (row.disputed) kinds.push('disputed');
  if (row.evidenceReviewedAt === null && isAiFlaggedVerification(row.aiVerification))
    kinds.push(`ai-${row.aiVerification}` as const);
  // Missing photo belongs in sign-off's strip, but does not count toward the queue's needsALook total.
  if (row.photo === null) kinds.push('missing-photo');
  return kinds;
}

const readingNeedsALook = (reading: JobReading | null) =>
  !!reading?.needsALook.some((kind) => kind !== 'missing-photo');

function mapJobReading(row: LoadedReading | null, capturedByName: string | null) {
  if (!row) return null;
  return JobReading.parse({
    ...row,
    capturedAt: row.capturedAt.toISOString(),
    evidenceReviewedAt: row.evidenceReviewedAt?.toISOString() ?? null,
    amendedAt: row.amendedAt?.toISOString() ?? null,
    aiHint: meterDisagreementHint(row),
    photoBacked: row.photo !== null,
    capturedByName,
    needsALook: readingAttention(row),
  });
}

/**
 * An override is a stored final amount that differs from the stored computed one; the two are always
 * written together. While the Job is Completed its hours and Measures may still move, so the computed
 * amount is re-derived from live facts and only an override survives; once Priced the stored figures
 * are the snapshot and are returned untouched.
 */
function priceAssignment(
  row: LoadedAssignment['stint'],
  facts: { billableHours: number | null; measures: readonly { measureTypeId: string; quantity: number }[] },
  live: boolean,
) {
  if (row.rateUnitAmount === null)
    return {
      computedAmount: null,
      finalAmount: null,
      amountEdited: false,
      measureMissing: false,
      billedQuantity: null,
    };
  const price = priceStint({
    basis: row.rateBasis,
    unitAmount: row.rateUnitAmount,
    measureTypeId: row.rateMeasureTypeId,
    ...facts,
  });
  const amountEdited = row.finalAmount !== row.computedAmount;
  return {
    computedAmount: live ? price.computedAmount : row.computedAmount,
    finalAmount: live && !amountEdited ? price.computedAmount : row.finalAmount,
    amountEdited,
    measureMissing: price.measureMissing,
    billedQuantity: price.quantity,
  };
}

function mapAssignment(row: LoadedAssignment, measures: readonly LoadedMeasure[], live: boolean) {
  const { stint } = row;
  const arrival = mapJobReading(row.arrival, row.arrivalCapturedByName);
  const departure = mapJobReading(row.departure, row.departureCapturedByName);
  const gapResolved = stint.gapResolvedAt !== null;
  const derived = deriveStintHours({
    arrival,
    departure,
    previousDeparture: row.previousDepartureValue === null ? null : { value: Number(row.previousDepartureValue) },
    travelIncluded: stint.travelIncluded,
    gap: gapResolved
      ? { travelHours: stint.gapTravelHours ?? 0, unaccountedHours: stint.gapUnaccountedHours ?? 0 }
      : null,
  });
  return Assignment.parse({
    ...stint,
    machineCode: row.machineCode,
    categoryName: row.categoryName,
    categoryIcon: row.categoryIcon,
    categoryColour: row.categoryColour,
    implementCode: row.implementCode,
    driverName: row.driverName,
    rateMeasureTypeName: row.rateMeasureTypeName,
    createdAt: stint.createdAt.toISOString(),
    arrival,
    departure,
    ...derived,
    gapResolved,
    measures,
    ...priceAssignment(stint, { billableHours: derived.billableHours, measures }, live),
  });
}

const arrivalOrder = (assignment: LoadedAssignment) =>
  assignment.arrival?.capturedAt.getTime() ?? Number.POSITIVE_INFINITY;

/** One Job for no one in particular: what writes return and what core reasons over. */
export async function getJob({ db, ...lookup }: { db: DbOrTx } & JobLookup): Promise<JobFacts> {
  const { job, assignments: rows, measures, chargeLines, ...names } = await loadJob(db, lookup);
  const live = job.status === 'completed';
  const assignments = rows
    .sort(
      (left, right) =>
        arrivalOrder(left) - arrivalOrder(right) || left.stint.createdAt.getTime() - right.stint.createdAt.getTime(),
    )
    .map((row) =>
      mapAssignment(
        row,
        measures.filter((measure) => measure.assignmentId === row.stint.id),
        live,
      ),
    );
  const pricing = priceJob(job, assignments, chargeLines);
  const states = assignments.map((assignment) => assignment.state);
  const openGapFlags = assignments.filter((assignment) => assignment.gapFlag).length;
  const flaggedReadings = assignments
    .flatMap((assignment) => [assignment.arrival, assignment.departure])
    .filter(readingNeedsALook).length;
  return JobFacts.parse({
    ...job,
    ...names,
    jobNumber: formatJobNumber(job.code),
    plannedStints: states.filter((state) => state === 'planned').length,
    onSiteStints: states.filter((state) => state === 'on-site').length,
    leftStints: states.filter((state) => state === 'left').length,
    looksFinished: looksFinished(job, states),
    openGapFlags,
    needsALook: openGapFlags + flaggedReadings,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    pricedAt: job.pricedAt?.toISOString() ?? null,
    invoicedAt: job.invoicedAt?.toISOString() ?? null,
    reopenedAt: job.reopenedAt?.toISOString() ?? null,
    dieselAmountEdited: pricing.dieselAmountEdited,
    discountAmount: live ? (pricing.hasDiscount ? pricing.totals.discountAmount : null) : job.discountAmount,
    pricing: { ...pricing.totals, gate: pricing.gate },
    assignments,
    chargeLines,
  });
}

/** The Machine Assignment inside a Job read, which a write to it has just returned. */
export function assignmentIn(job: JobFacts, id: string): Assignment {
  const assignment = job.assignments.find((candidate) => candidate.id === id);
  if (!assignment) throw jobNotFound('Machine Assignment');
  return assignment;
}

export function chargeLineIn(job: JobFacts, id: string): ChargeLine {
  const line = job.chargeLines.find((candidate) => candidate.id === id);
  if (!line) throw jobNotFound('Charge Line');
  return line;
}

/** Totals and the Mark as Priced gate from the stints' amounts, the Charge Lines, Diesel and the Discount. */
function priceJob(
  job: typeof contractingJobs.$inferSelect,
  assignments: readonly Assignment[],
  chargeLines: readonly { amount: number | null }[],
) {
  const stints = assignments.filter((assignment) => assignment.state === 'left');
  const discount =
    job.discountKind !== null && job.discountValue !== null
      ? { kind: job.discountKind, value: job.discountValue }
      : null;
  const dieselComputed =
    job.dieselUnitPrice === null ? null : computeDieselAmount(job.dieselLitres, job.dieselUnitPrice);
  return {
    hasDiscount: discount !== null,
    dieselAmountEdited: job.dieselAmount !== null && dieselComputed !== null && job.dieselAmount !== dieselComputed,
    totals: computeJobTotals({
      stintFinalAmounts: stints.map((stint) => stint.finalAmount ?? 0),
      chargeLineAmounts: chargeLines.map((line) => line.amount ?? 0),
      discount,
      dieselAmount: job.dieselLitres > 0 ? (job.dieselAmount ?? 0) : 0,
    }),
    gate: canMarkPriced({
      dieselLitres: job.dieselLitres,
      dieselAmount: job.dieselAmount,
      stints: stints.map((stint) => ({ priced: stint.rateUnitAmount !== null })),
      chargeLines,
    }),
  };
}

const readRefusals: Record<JobReadMode, string> = {
  all: 'You do not have permission to view this Job.',
  own: 'Foremen can only view their open and completed Jobs.',
  priced: 'Invoicing can only view Completed, Priced, or Invoiced Jobs.',
};

/** One Job as the person asking reads it: their read mode's view, and what they may do to it. */
export async function getReadableJob({ db, actor, ...lookup }: { db: Db; actor: JobActor } & JobLookup) {
  const reader = readerFor(actor);
  const job = await getJob({ db, ...lookup });
  if (reader.mode === 'own') assertOwner(job, reader.actorUserId);
  if (!hasJobStatus(jobReadStatuses[reader.mode], job.status))
    throw new JobError('contracting_job.forbidden', readRefusals[reader.mode]);
  const read = { ...job, actions: deriveJobActions(job, actor) };
  return JobDetail.parse(jobReadSeesMoney(reader.mode) ? read : redactMoney(read));
}

/** The Jobs a reader may see: their mode's statuses, and a Foreman's own Jobs only. */
function readableBy({ mode, actorUserId }: JobReader) {
  return and(
    inArray(contractingJobs.status, [...jobReadStatuses[mode]]),
    mode === 'own' ? eq(contractingJobs.foremanUserId, actorUserId) : undefined,
  );
}

/** Each queue is one status; Looks finished narrows Active to Jobs whose machines have all left. */
const queueStatus: Record<JobQueue, JobStatus> = {
  upcoming: 'upcoming',
  active: 'active',
  'looks-finished': 'active',
  'awaiting-pricing': 'completed',
  'awaiting-invoice': 'priced',
  invoiced: 'invoiced',
  cancelled: 'cancelled',
};

export async function countJobQueues({ db, actor }: { db: Db; actor: JobActor }) {
  const reader = readerFor(actor);
  const rows = await db
    .select({
      status: contractingJobs.status,
      looksFinished: jobSql.looksFinished,
      count: sql<number>`count(*)::integer`,
    })
    .from(contractingJobs)
    .where(readableBy(reader))
    .groupBy(contractingJobs.status, jobSql.looksFinished);
  const count = (queue: JobQueue) =>
    rows
      .filter((row) => row.status === queueStatus[queue] && (queue !== 'looks-finished' || row.looksFinished))
      .reduce((total, row) => total + row.count, 0);
  return JobQueueCounts.parse(Object.fromEntries(jobQueues.map((queue) => [queue, count(queue)])));
}

export async function hasActiveJobAttention({ db, actor }: { db: Db; actor: JobActor }) {
  const reader = readerFor(actor);
  const rows = await db
    .select({ id: contractingJobs.id })
    .from(contractingJobs)
    .where(
      and(
        eq(contractingJobs.status, 'active'),
        readableBy(reader),
        sql`${jobSql.openGapFlags} + ${jobSql.readingsNeedingALook} > 0`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function listJobs({
  db,
  actor,
  queue,
  limit,
  offset,
  invoicedInMonth,
}: {
  db: Db;
  actor: JobActor;
  queue: JobQueue;
  limit: number;
  offset: number;
  /** Honoured only for the invoiced queue: Jobs stamped in this South African calendar month. */
  invoicedInMonth?: string | undefined;
}) {
  const reader = readerFor(actor);
  if (!hasJobStatus(jobReadStatuses[reader.mode], queueStatus[queue]))
    throw new JobError('contracting_job.forbidden', readRefusals[reader.mode]);
  const rows = await db
    .select({
      id: contractingJobs.id,
      code: contractingJobs.code,
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
      plannedStints: jobSql.stintCount('planned'),
      onSiteStints: jobSql.stintCount('on-site'),
      leftStints: jobSql.stintCount('left'),
      looksFinished: jobSql.looksFinished,
      openGapFlags: jobSql.openGapFlags,
      needsALook: sql<number>`${jobSql.openGapFlags} + ${jobSql.readingsNeedingALook}`,
      startDate: contractingJobs.startDate,
      endDate: contractingJobs.endDate,
      pricedAt: contractingJobs.pricedAt,
      pricedTotal: contractingJobs.pricedTotal,
      invoiceNumber: contractingJobs.invoiceNumber,
      invoicedAt: contractingJobs.invoicedAt,
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
        eq(contractingJobs.status, queueStatus[queue]),
        queue === 'looks-finished' ? jobSql.looksFinished : undefined,
        readableBy(reader),
        queue === 'invoiced' && invoicedInMonth
          ? sql`date_trunc('month', ${contractingJobs.invoicedAt} at time zone ${JOHANNESBURG_TIME_ZONE}) = date_trunc('month', ${invoicedInMonth}::timestamp)`
          : undefined,
      ),
    )
    .orderBy(asc(contractingJobs.code))
    .limit(limit)
    .offset(offset);
  const seesMoney = jobReadSeesMoney(reader.mode);
  return rows.map((row) =>
    JobSummary.parse({
      ...row,
      jobNumber: formatJobNumber(row.code),
      pricedTotal: seesMoney ? row.pricedTotal : null,
      pricedAt: row.pricedAt?.toISOString() ?? null,
      invoicedAt: row.invoicedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }),
  );
}

export function redactMoney<T extends JobFacts>(job: T): T {
  return {
    ...job,
    dieselUnitPrice: null,
    dieselAmount: null,
    dieselAmountEdited: false,
    discountKind: null,
    discountValue: null,
    discountAmount: null,
    pricedSubtotal: null,
    pricedTotal: null,
    reopenedAt: null,
    repricingNote: null,
    pricing: null,
    assignments: job.assignments.map((assignment) => ({
      ...assignment,
      rateId: null,
      rateName: null,
      rateBasis: null,
      rateMeasureTypeId: null,
      rateMeasureTypeName: null,
      rateUnitAmount: null,
      computedAmount: null,
      finalAmount: null,
      amountEdited: false,
      measureMissing: false,
      billedQuantity: null,
    })),
    chargeLines: job.chargeLines.map((line) => ({ ...line, amount: null })),
  };
}

export async function listForemen({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.contractingRole, 'foreman'))
    .orderBy(asc(user.name));
}
