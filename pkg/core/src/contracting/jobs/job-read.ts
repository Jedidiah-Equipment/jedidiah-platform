import { type Db, user } from '@pkg/db';
import { contractingJobs } from '@pkg/db/contracting';
import {
  type AttentionThresholds,
  deriveAssignmentActions,
  deriveJobActions,
  deriveStintHours,
  formatJobNumber,
  type JobActor,
  jobNeedsALookCount,
  jobReadSeesMoney,
  looksFinished,
  parseJobNumber,
  priceJob,
  type StoredStintPricing,
  stintAttentionKinds,
} from '@pkg/domain/contracting';
import { type Assignment, FieldDriver, type JobDetail, JobFacts } from '@pkg/schema/contracting';
import { and, asc, eq } from 'drizzle-orm';
import { getContractingSettings } from '../settings/settings-service.js';
import { assertOwner, jobNotFound } from './job-errors.js';
import {
  type DbOrTx,
  type LoadedMeasure,
  type LoadedStint,
  loadChargeLines,
  loadMeasures,
  loadStints,
  selectJobs,
  stintNames,
} from './job-load.js';
import { assertReadableStatus, readerFor } from './job-readers.js';

export type JobLookup = { id: string } | { code: string };
/** One of a stint's Job Hours as the wire carries it, or null before it was captured. */
function jobHoursValue({
  hours,
  at,
  byUserId,
  byName,
  comment,
  telematicsHours,
  telematicsAt,
}: LoadedStint['arrival']) {
  if (hours === null || at === null || byUserId === null) return null;
  return {
    hours,
    at: at.toISOString(),
    byUserId,
    byName: byName ?? '',
    comment,
    telematics:
      telematicsHours !== null && telematicsAt !== null
        ? { hours: telematicsHours, at: telematicsAt.toISOString() }
        : null,
  };
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

function mapAssignment(row: LoadedStint, measures: readonly LoadedMeasure[], thresholds: AttentionThresholds) {
  const { stint } = row;
  const arrival = jobHoursValue(row.arrival);
  const departure = jobHoursValue(row.departure);
  const { arrivalHours, departureHours, travelHours, travelClamped } = stint;
  return {
    ...stint,
    ...stintNames(row),
    createdAt: stint.createdAt.toISOString(),
    arrival,
    departure,
    travelSetByName: stint.travelSetAt ? row.travelSetByName : null,
    ...deriveStintHours({ arrivalHours, departureHours, travelHours }),
    attention: stintAttentionKinds(
      { travelHours, travelClamped, travelSet: stint.travelSetAt !== null, arrival, departure },
      thresholds,
    ),
    amendment:
      stint.hoursAmendedAt && stint.hoursAmendmentReason
        ? {
            at: stint.hoursAmendedAt.toISOString(),
            byName: row.hoursAmendedByName ?? '',
            reason: stint.hoursAmendmentReason,
          }
        : null,
    measures,
  };
}

const arrivalOrder = (row: LoadedStint) => row.stint.arrivalAt?.getTime() ?? Number.POSITIVE_INFINITY;

export async function getJob({ db, ...lookup }: { db: DbOrTx } & JobLookup): Promise<JobFacts> {
  const [header] = await selectJobs(db).where(
    'id' in lookup ? eq(contractingJobs.id, lookup.id) : eq(contractingJobs.code, parseJobNumber(lookup.code)),
  );
  if (!header) throw jobNotFound();
  const { job, ...names } = header;
  const [rows, measures, chargeLines, settings] = await Promise.all([
    loadStints(db, [job.id]),
    loadMeasures(db, job.id),
    loadChargeLines(db, job.id),
    getContractingSettings({ db }),
  ]);
  const sorted = rows.sort(
    (left, right) =>
      arrivalOrder(left) - arrivalOrder(right) || left.stint.createdAt.getTime() - right.stint.createdAt.getTime(),
  );
  const stints = sorted.map((row) => ({
    assignment: mapAssignment(
      row,
      measures.filter((measure) => measure.assignmentId === row.stint.id),
      settings,
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
  return JobFacts.parse({
    ...job,
    ...names,
    jobNumber: formatJobNumber(job.code),
    plannedStints: states.filter((state) => state === 'planned').length,
    onSiteStints: states.filter((state) => state === 'on-site').length,
    leftStints: states.filter((state) => state === 'left').length,
    looksFinished: looksFinished(job, states),
    assignmentAttention: jobNeedsALookCount(assignments),
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
    travelFlagThresholdHours: settings.travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours: settings.johnDeereDifferenceThresholdHours,
  });
}

/** The Machine Assignment inside a Job read: the derived facts a write reads under its lock. */
export function assignmentIn(job: JobFacts, id: string): Assignment {
  const assignment = job.assignments.find((candidate) => candidate.id === id);
  if (!assignment) throw jobNotFound('Machine Assignment');
  return assignment;
}

/** One Job as the person asking reads it: their read mode's view, what they may do to it, and whether money reached them. */
export async function getReadableJob({
  db,
  actor,
  ...lookup
}: { db: Db; actor: JobActor } & JobLookup): Promise<JobDetail> {
  const reader = readerFor(actor);
  const job = await getJob({ db, ...lookup });
  if (reader.mode === 'own') assertOwner(job, reader.actorUserId);
  assertReadableStatus(job.status, reader);
  const seesMoney = jobReadSeesMoney(reader.mode);
  const actions = deriveJobActions(job, actor);
  const read = {
    ...job,
    actions,
    seesMoney,
    assignments: job.assignments.map((assignment) => ({
      ...assignment,
      actions: deriveAssignmentActions(actions, assignment),
    })),
  };
  return seesMoney ? read : redactMoney(read);
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

export async function listFieldDrivers({ db }: { db: Db }) {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(and(eq(user.contractingRole, 'driver'), eq(user.isDevice, false)))
    .orderBy(asc(user.name))
    .then((rows) => rows.map((row) => FieldDriver.parse(row)));
}
