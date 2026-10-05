import { type Db, user } from '@pkg/db';
import { type contractingHourReadings, contractingJobs } from '@pkg/db/contracting';
import {
  deriveJobActions,
  deriveStintHours,
  formatJobNumber,
  type JobActor,
  jobAssignmentAttentionCounts,
  jobReadSeesMoney,
  jobReadStatuses,
  looksFinished,
  parseJobNumber,
  priceJob,
  readingAttentionKinds,
  readingNeedsALookLevel,
  type StoredStintPricing,
  tallyAssignmentAttention,
} from '@pkg/domain/contracting';
import { type Assignment, hasJobStatus, type JobDetail, JobFacts, type JobStatus } from '@pkg/schema/contracting';
import { asc, eq } from 'drizzle-orm';
import { readingToWire } from '../readings/reading-wire.js';
import { assertOwner, jobNotFound } from './job-errors.js';
import {
  type DbOrTx,
  type LoadedMeasure,
  type LoadedStint,
  loadChargeLines,
  loadMeasures,
  loadPreviousDepartures,
  loadStints,
  selectJobs,
  stintNames,
} from './job-load.js';
import { assertReadableStatus, type JobReader, readerFor } from './job-readers.js';

export type JobLookup = { id: string } | { code: string };
type LoadedReading = typeof contractingHourReadings.$inferSelect;

function mapJobReading(row: LoadedReading | null, capturedByName: string | null, amendedByName: string | null) {
  return row
    ? {
        ...readingToWire(row),
        capturedByName,
        amendedByName,
        attention: readingAttentionKinds({ ...row, photoBacked: row.photo !== null }),
      }
    : null;
}

/** The stored Rate snapshot: no Rate amount is un-priced, no Rate id is No charge. */
function storedPricing(row: LoadedStint): StoredStintPricing | null {
  const { stint } = row;
  if (stint.rateUnitAmount === null) return null;
  if (stint.rateId === null || stint.rateName === null || stint.rateBasis === null) return { kind: 'no-charge' };
  return {
    kind: 'rate',
    rateId: stint.rateId,
    name: stint.rateName,
    basis: stint.rateBasis,
    measureTypeId: stint.rateMeasureTypeId,
    measureTypeName: row.rateMeasureTypeName,
    unitAmount: stint.rateUnitAmount,
    amountOverride: stint.amountOverride,
    computedAmount: stint.computedAmount,
    finalAmount: stint.finalAmount,
  };
}

function previousJobOf({
  jobCode,
  jobStatus,
  customerName,
  farmName,
}: { jobCode: number | null; jobStatus: JobStatus | null } & Record<'customerName' | 'farmName', string | null>) {
  return jobCode === null || jobStatus === null || customerName === null || farmName === null
    ? null
    : { jobNumber: formatJobNumber(jobCode), status: jobStatus, customerName, farmName };
}

function mapAssignment(
  row: LoadedStint,
  measures: readonly LoadedMeasure[],
  previousDepartures: Awaited<ReturnType<typeof loadPreviousDepartures>>,
) {
  const { stint } = row;
  const arrival = mapJobReading(row.arrival, row.arrivalCapturedByName, row.arrivalAmendedByName);
  const departure = mapJobReading(row.departure, row.departureCapturedByName, row.departureAmendedByName);
  const gapResolved = stint.gapResolvedAt !== null;
  const previousDeparture = previousDepartures.get(stint.id);
  const derived = deriveStintHours({
    arrival,
    departure,
    previousDeparture: previousDeparture ?? null,
    travelIncluded: stint.travelIncluded,
    gap: gapResolved
      ? { travelHours: stint.gapTravelHours ?? 0, unaccountedHours: stint.gapUnaccountedHours ?? 0 }
      : null,
  });
  return {
    ...stint,
    ...stintNames(row),
    createdAt: stint.createdAt.toISOString(),
    arrival,
    departure,
    previousDeparture: previousDeparture
      ? {
          value: previousDeparture.value,
          capturedAt: previousDeparture.capturedAt.toISOString(),
          job: previousJobOf(previousDeparture),
        }
      : null,
    ...derived,
    gapResolved,
    measures,
  };
}

const arrivalOrder = (row: LoadedStint) => row.arrival?.capturedAt.getTime() ?? Number.POSITIVE_INFINITY;

export async function getJob({ db, ...lookup }: { db: DbOrTx } & JobLookup): Promise<JobFacts> {
  const [header] = await selectJobs(db).where(
    'id' in lookup ? eq(contractingJobs.id, lookup.id) : eq(contractingJobs.code, parseJobNumber(lookup.code)),
  );
  if (!header) throw jobNotFound();
  const { job, ...names } = header;
  const [rows, previousDepartures, measures, chargeLines] = await Promise.all([
    loadStints(db, [job.id]),
    loadPreviousDepartures(db, job.id),
    loadMeasures(db, job.id),
    loadChargeLines(db, job.id),
  ]);
  const sorted = rows.sort(
    (left, right) =>
      arrivalOrder(left) - arrivalOrder(right) || left.stint.createdAt.getTime() - right.stint.createdAt.getTime(),
  );
  const stints = sorted.map((row) => ({
    assignment: mapAssignment(
      row,
      measures.filter((measure) => measure.assignmentId === row.stint.id),
      previousDepartures,
    ),
    stored: storedPricing(row),
  }));
  const priced = priceJob({
    status: job.status,
    stints: stints.map(({ assignment, stored }) => ({
      state: assignment.state,
      billableHours: assignment.billableHours,
      measures: assignment.measures,
      stored,
    })),
    chargeLines,
    diesel: {
      litres: job.dieselLitres,
      unitPrice: job.dieselUnitPrice,
      amountOverride: job.dieselAmountOverride,
      amount: job.dieselAmount,
    },
    discount:
      job.discountKind !== null && job.discountValue !== null
        ? { kind: job.discountKind, value: job.discountValue, amount: job.discountAmount }
        : null,
  });
  const assignments = stints.map(({ assignment }, index) => ({ ...assignment, pricing: priced.stints[index] }));
  const states = assignments.map((assignment) => assignment.state);
  const openGapFlags = assignments.filter((assignment) => assignment.gapFlag).length;
  const flaggedReadings = tallyAssignmentAttention(
    assignments
      .flatMap((assignment) => [assignment.arrival, assignment.departure])
      .flatMap((reading) => {
        const level = reading ? readingNeedsALookLevel(reading) : null;
        return level ? [level] : [];
      }),
  );
  return JobFacts.parse({
    ...job,
    ...names,
    jobNumber: formatJobNumber(job.code),
    plannedStints: states.filter((state) => state === 'planned').length,
    onSiteStints: states.filter((state) => state === 'on-site').length,
    leftStints: states.filter((state) => state === 'left').length,
    looksFinished: looksFinished(job, states),
    openGapFlags,
    assignmentAttention: jobAssignmentAttentionCounts(openGapFlags, flaggedReadings),
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    pricedAt: job.pricedAt?.toISOString() ?? null,
    invoicedAt: job.invoicedAt?.toISOString() ?? null,
    reopenedAt: job.reopenedAt?.toISOString() ?? null,
    diesel: priced.diesel,
    discount: priced.discount,
    pricing: priced.pricing,
    assignments,
    chargeLines,
  });
}

/** The Machine Assignment inside a Job read: the derived facts a write reads under its lock. */
export function assignmentIn(job: JobFacts, id: string): Assignment {
  const assignment = job.assignments.find((candidate) => candidate.id === id);
  if (!assignment) throw jobNotFound('Machine Assignment');
  return assignment;
}

/** One Job as the person asking reads it: their read mode's view, and what they may do to it. */
export async function getReadableJob({
  db,
  actor,
  ...lookup
}: { db: Db; actor: JobActor } & JobLookup): Promise<JobDetail> {
  const reader = readerFor(actor);
  const job = await getJob({ db, ...lookup });
  if (reader.mode === 'own') assertOwner(job, reader.actorUserId);
  assertReadableStatus(job.status, reader);
  const read = { ...job, actions: deriveJobActions(job, actor) };
  const scoped = hideUnreadablePreviousJobs(read, reader);
  return jobReadSeesMoney(reader.mode) ? scoped : redactMoney(scoped);
}

/**
 * The Job a Machine left before arriving is named only to a reader who could open it: never to a Foreman, who
 * reads only his own Jobs, and to Invoicing only once it is Completed or later.
 */
function hideUnreadablePreviousJobs(job: JobDetail, reader: JobReader): JobDetail {
  const readable = (status: JobStatus) => reader.mode !== 'own' && hasJobStatus(jobReadStatuses[reader.mode], status);
  return {
    ...job,
    assignments: job.assignments.map(({ previousDeparture, ...assignment }) => ({
      ...assignment,
      previousDeparture:
        previousDeparture?.job && !readable(previousDeparture.job.status)
          ? { ...previousDeparture, job: null }
          : previousDeparture,
    })),
  };
}

export function redactMoney(job: JobDetail): JobDetail {
  return {
    ...job,
    diesel: null,
    discount: null,
    pricedTotal: null,
    reopenedAt: null,
    repricingNote: null,
    pricing: null,
    assignments: job.assignments.map((assignment) => ({ ...assignment, pricing: null })),
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
