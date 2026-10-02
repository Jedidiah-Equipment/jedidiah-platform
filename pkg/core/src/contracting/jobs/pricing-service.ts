import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { formatNumber } from '@pkg/domain';
import { computeDieselAmount, type JobActor, jobTransitions, pricingGateReasons } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type {
  Assignment,
  DieselPriceInput,
  DiscountSetInput,
  JobMarkPricedInput,
  StintAmountSetInput,
  StintRateClearInput,
  StintRateSetInput,
} from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { isRateCardError } from '../rate-card/rate-card-errors.js';
import { getRate } from '../rate-card/rate-service.js';
import { assertAssignmentAction, JobError, totalChanged, wrongStatus } from './job-errors.js';
import { lockJob, lockJobFor, lockStintFor } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { jobTransaction, writeAssignment, writeJobRow } from './job-write.js';

type StintPricingColumns = Pick<
  typeof contractingMachineAssignments.$inferInsert,
  | 'rateId'
  | 'rateName'
  | 'rateBasis'
  | 'rateMeasureTypeId'
  | 'rateUnitAmount'
  | 'amountOverride'
  | 'computedAmount'
  | 'finalAmount'
>;

const noRate = { rateId: null, rateName: null, rateBasis: null, rateMeasureTypeId: null } as const;
/** A Job that is not Priced stores no amounts; every pricing write says so. */
const unfrozen = { computedAmount: null, finalAmount: null } as const;

const isPriced = (stint: Pick<Assignment, 'pricing'>) => stint.pricing !== null;

/** Locks the stint and its Job, checks Pricing is open, and returns the live read of the Job and the stint. */
async function openStint(tx: DatabaseTransaction, assignmentId: string, actor: JobActor) {
  const { job: row, stint: locked, machineCode } = await lockStintFor(tx, assignmentId, 'price', actor);
  assertAssignmentAction('price', locked);
  const job = await getJob({ db: tx, id: row.id });
  const stint = assignmentIn(job, assignmentId);
  return { machineCode, job, stint };
}

const writeStintPricing = (
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  machineCode: string,
  id: string,
  values: StintPricingColumns,
) => writeAssignment(tx, actorUserId, machineCode, id, () => values);

async function findRate(tx: DatabaseTransaction, id: string) {
  try {
    return await getRate({ db: tx, id });
  } catch (error) {
    if (isRateCardError(error)) throw new JobError('contracting_job.invalid_reference', 'That Rate no longer exists.');
    throw error;
  }
}

export async function setStintRate({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: StintRateSetInput;
}): Promise<void> {
  const actorUserId = actor.userId;
  await jobTransaction(db, async (tx) => {
    const { machineCode, job, stint: chosen } = await openStint(tx, input.assignmentId, actor);
    const rate = input.rateId ? await findRate(tx, input.rateId) : null;
    if (rate && !rate.active)
      throw new JobError('contracting_job.rate_inactive', 'That Rate is no longer active. Pick another.');
    // The read model orders stints by arrival, so the first of the machine's stints is its first stint.
    const stints = job.assignments.filter(
      (assignment) => assignment.machineId === chosen.machineId && assignment.state === 'left',
    );
    const targets =
      stints[0]?.id === chosen.id ? stints.filter((stint) => stint.id === chosen.id || !isPriced(stint)) : [chosen];
    const snapshot = rate
      ? {
          rateId: rate.id,
          rateName: rate.name,
          rateBasis: rate.basis,
          rateMeasureTypeId: rate.measureTypeId,
          rateUnitAmount: rate.amount,
        }
      : { ...noRate, rateUnitAmount: 0 };
    // Choosing a Rate discards any amount override.
    for (const stint of targets)
      await writeStintPricing(tx, actorUserId, machineCode, stint.id, {
        ...snapshot,
        amountOverride: null,
        ...unfrozen,
      });
  });
}

export async function clearStintRate({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: StintRateClearInput;
}): Promise<void> {
  const actorUserId = actor.userId;
  await jobTransaction(db, async (tx) => {
    const { machineCode } = await openStint(tx, input.assignmentId, actor);
    await writeStintPricing(tx, actorUserId, machineCode, input.assignmentId, {
      ...noRate,
      rateUnitAmount: null,
      amountOverride: null,
      ...unfrozen,
    });
  });
}

export async function setStintAmount({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: StintAmountSetInput;
}): Promise<void> {
  const actorUserId = actor.userId;
  await jobTransaction(db, async (tx) => {
    const { machineCode, stint } = await openStint(tx, input.assignmentId, actor);
    const { pricing } = stint;
    if (pricing === null) throw wrongStatus('Pick a Rate before changing the amount.');
    if (pricing.kind === 'no-charge') throw wrongStatus('A No charge line is included in the quote and bills nothing.');
    const { computedAmount } = pricing;
    const amountOverride =
      input.finalAmount === null || input.finalAmount === computedAmount ? null : input.finalAmount;
    await writeStintPricing(tx, actorUserId, machineCode, stint.id, { amountOverride, ...unfrozen });
  });
}

export async function setDieselPrice({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: DieselPriceInput;
}): Promise<void> {
  await jobTransaction(db, async (tx) => {
    const before = await lockJobFor(tx, input.jobId, 'price', actor);
    if (input.unitPrice !== null && before.dieselLitres === 0) throw wrongStatus('No diesel was supplied on this Job.');
    await writeJobRow(tx, actor.userId, before.id, (row) => {
      if (input.unitPrice === null) return { dieselUnitPrice: null, dieselAmountOverride: null, dieselAmount: null };
      const computed = computeDieselAmount(row.dieselLitres, input.unitPrice);
      const amount = input.amount ?? computed;
      return {
        dieselUnitPrice: input.unitPrice,
        dieselAmountOverride: amount === computed ? null : amount,
        dieselAmount: null,
      };
    });
  });
}

export async function setDiscount({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: DiscountSetInput;
}): Promise<void> {
  const { discount } = input;
  await jobTransaction(db, async (tx) => {
    await lockJobFor(tx, input.jobId, 'price', actor);
    await writeJobRow(tx, actor.userId, input.jobId, () => ({
      discountKind: discount?.kind ?? null,
      discountValue: discount?.value ?? null,
      discountAmount: null,
    }));
  });
}

export async function markPriced({
  db,
  actor,
  input,
}: {
  db: Db;
  actor: JobActor;
  input: JobMarkPricedInput;
}): Promise<void> {
  const actorUserId = actor.userId;
  await jobTransaction(db, async (tx) => {
    const before = await lockJobFor(tx, input.id, 'price', actor);
    const detail = await getJob({ db: tx, id: before.id });
    const { pricing } = detail;
    if (!pricing.gate.ok)
      throw new JobError(
        'contracting_job.pricing_incomplete',
        `This Job cannot be priced yet: ${pricingGateReasons(pricing.gate).join(' · ')}.`,
      );
    if (pricing.total !== input.expectedTotal)
      throw totalChanged('The total changed while you were pricing. Review it and mark as Priced again.');
    // The live figures become the snapshot: from here the read model trusts the stored amounts.
    for (const stint of detail.assignments)
      if (stint.state === 'left' && stint.pricing?.kind === 'rate')
        await writeStintPricing(tx, actorUserId, stint.machineCode, stint.id, {
          computedAmount: stint.pricing.computedAmount,
          finalAmount: stint.pricing.finalAmount,
        });
    await writeJobRow(tx, actorUserId, input.id, (row) => ({
      ...jobTransitions.price(row, {
        at: new Date(),
        byUserId: actorUserId,
        subtotal: pricing.subtotal,
        total: pricing.total,
      }),
      discountAmount: row.discountKind === null ? null : pricing.discountAmount,
      dieselAmount: row.dieselLitres > 0 ? pricing.dieselAmount : null,
    }));
  });
}

/**
 * Returns a Priced Job to Completed after a reading amendment moved its hours. Rates, unit amounts, the
 * Diesel price, the Discount and Charge Line amounts stay; every stint amount is derived again from the
 * amended hours and amount overrides are discarded. Runs inside the amendment's transaction, after the
 * machine lock and the reading writes, so the lock order stays machine → job → stint.
 */
export async function reopenPricingWithin(tx: DatabaseTransaction, actorUserId: AuthId, jobId: string, reason: string) {
  const job = await lockJob(tx, jobId);
  if (job.status !== 'priced') throw wrongStatus('Only a Priced Job can be reopened for pricing.');
  const stints = await tx
    .select({ amountOverride: contractingMachineAssignments.amountOverride })
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .for('update');
  const edited = stints.filter((stint) => stint.amountOverride !== null).length;
  const note = edited
    ? `${reason} ${formatNumber(edited)} edited ${edited === 1 ? 'amount was' : 'amounts were'} reset.`
    : reason;
  await writeJobRow(tx, actorUserId, jobId, (row) => jobTransitions.reopen(row, { at: new Date(), note }));
  const reopened = await getJob({ db: tx, id: jobId });
  for (const stint of reopened.assignments)
    if (stint.pricing !== null)
      await writeStintPricing(tx, actorUserId, stint.machineCode, stint.id, { amountOverride: null, ...unfrozen });
}
