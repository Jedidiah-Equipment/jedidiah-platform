import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingMachineAssignments } from '@pkg/db/contracting';
import { formatNumber } from '@pkg/domain';
import {
  computeDieselAmount,
  computeDiscountAmount,
  type JobActor,
  priceStint,
  pricingGateReasons,
  transitionJob,
} from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type {
  Assignment,
  DieselPriceInput,
  DiscountSetInput,
  JobFacts,
  JobMarkPricedInput,
  StintAmountSetInput,
  StintRateClearInput,
  StintRateSetInput,
} from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { isRateCardError } from '../rate-card/rate-card-errors.js';
import { getRate } from '../rate-card/rate-service.js';
import { assertJobAction, JobError, jobNotFound, totalChanged, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockAssignment, lockJob } from './job-lock.js';
import { assignmentIn, getJob } from './job-read.js';
import { writeAssignment, writeJob } from './job-write.js';

type StintPricing = Pick<
  typeof contractingMachineAssignments.$inferInsert,
  'rateId' | 'rateName' | 'rateBasis' | 'rateMeasureTypeId' | 'rateUnitAmount' | 'computedAmount' | 'finalAmount'
>;

const noRate = { rateId: null, rateName: null, rateBasis: null, rateMeasureTypeId: null } as const;

const isPriced = (stint: Pick<Assignment, 'rateUnitAmount'>) => stint.rateUnitAmount !== null;

/** A Completed Job's live figures; only a money-redacted read lacks them. */
function livePricing(job: JobFacts) {
  if (!job.pricing) throw new Error('A Completed Job always carries its pricing.');
  return job.pricing;
}

/** Locks the stint and its Job, checks Pricing is open, and returns the live read of the Job and the stint. */
async function openStint(tx: DatabaseTransaction, assignmentId: string, actor: JobActor) {
  const { job: row, machineCode } = await lockAssignment(tx, assignmentId);
  assertJobAction('price', row, actor);
  const job = await getJob({ db: tx, id: row.id });
  const stint = assignmentIn(job, assignmentId);
  if (stint.state !== 'left') throw jobNotFound('Machine Assignment');
  return { machineCode, job, stint };
}

const writeStintPricing = (
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  machineCode: string,
  id: string,
  values: StintPricing,
) => writeAssignment(tx, actorUserId, machineCode, id, { set: () => values });

async function findRate(tx: DatabaseTransaction, id: string) {
  try {
    return await getRate({ db: tx, id });
  } catch (error) {
    if (isRateCardError(error)) throw new JobError('contracting_job.invalid_reference', 'That Rate no longer exists.');
    throw error;
  }
}

export async function setStintRate({ db, actor, input }: { db: Db; actor: JobActor; input: StintRateSetInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
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
      for (const stint of targets) {
        const { computedAmount } = priceStint({
          basis: snapshot.rateBasis,
          unitAmount: snapshot.rateUnitAmount,
          measureTypeId: snapshot.rateMeasureTypeId,
          billableHours: stint.billableHours,
          measures: stint.measures,
        });
        // Final and computed are written equal, so choosing a Rate discards any amount override.
        await writeStintPricing(tx, actorUserId, machineCode, stint.id, {
          ...snapshot,
          computedAmount,
          finalAmount: computedAmount,
        });
      }
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function clearStintRate({ db, actor, input }: { db: Db; actor: JobActor; input: StintRateClearInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { machineCode, job } = await openStint(tx, input.assignmentId, actor);
      await writeStintPricing(tx, actorUserId, machineCode, input.assignmentId, {
        ...noRate,
        rateUnitAmount: null,
        computedAmount: null,
        finalAmount: null,
      });
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function setStintAmount({ db, actor, input }: { db: Db; actor: JobActor; input: StintAmountSetInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { machineCode, job, stint } = await openStint(tx, input.assignmentId, actor);
      if (!isPriced(stint) || stint.computedAmount === null)
        throw wrongStatus('Pick a Rate before changing the amount.');
      if (stint.rateBasis === null) throw wrongStatus('A No charge line is included in the quote and bills nothing.');
      // Computed is rewritten to the live figure in the same write, so final ≠ computed stays the override test.
      await writeStintPricing(tx, actorUserId, machineCode, stint.id, {
        computedAmount: stint.computedAmount,
        finalAmount: input.finalAmount ?? stint.computedAmount,
      });
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function setDieselPrice({ db, actor, input }: { db: Db; actor: JobActor; input: DieselPriceInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    writeJob(db, actorUserId, input.jobId, {
      assert: (_tx, before) => {
        assertJobAction('price', before, actor);
        if (input.unitPrice !== null && before.dieselLitres === 0)
          throw wrongStatus('No diesel was supplied on this Job.');
      },
      set: (before) =>
        input.unitPrice === null
          ? { dieselUnitPrice: null, dieselAmount: null }
          : {
              dieselUnitPrice: input.unitPrice,
              dieselAmount: input.amount ?? computeDieselAmount(before.dieselLitres, input.unitPrice),
            },
    }),
  );
}

export async function setDiscount({ db, actor, input }: { db: Db; actor: JobActor; input: DiscountSetInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      assertJobAction('price', await lockJob(tx, input.jobId), actor);
      const { discount } = input;
      const { subtotal } = livePricing(await getJob({ db: tx, id: input.jobId }));
      return writeJob(tx, actorUserId, input.jobId, {
        set: () =>
          discount === null
            ? { discountKind: null, discountValue: null, discountAmount: null }
            : {
                discountKind: discount.kind,
                discountValue: discount.value,
                // Kept current for the audit trail; the read model recomputes it while Completed.
                discountAmount: computeDiscountAmount(subtotal, discount),
              },
      });
    }),
  );
}

export async function markPriced({ db, actor, input }: { db: Db; actor: JobActor; input: JobMarkPricedInput }) {
  const actorUserId = actor.userId;
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const before = await lockJob(tx, input.id);
      assertJobAction('price', before, actor);
      const detail = await getJob({ db: tx, id: before.id });
      const pricing = livePricing(detail);
      if (!pricing.gate.ok)
        throw new JobError(
          'contracting_job.pricing_incomplete',
          `This Job cannot be priced yet: ${pricingGateReasons(pricing.gate).join(' · ')}.`,
        );
      if (pricing.total !== input.expectedTotal)
        throw totalChanged('The total changed while you were pricing. Review it and mark as Priced again.');
      // The live figures become the snapshot: from here the read model trusts the stored amounts.
      for (const stint of detail.assignments)
        if (stint.state === 'left' && stint.computedAmount !== null && stint.finalAmount !== null)
          await writeStintPricing(tx, actorUserId, stint.machineCode, stint.id, {
            computedAmount: stint.computedAmount,
            finalAmount: stint.finalAmount,
          });
      return writeJob(tx, actorUserId, input.id, {
        set: (row) => ({
          ...transitionJob(row, {
            type: 'price',
            at: new Date(),
            byUserId: actorUserId,
            subtotal: pricing.subtotal,
            total: pricing.total,
          }),
          discountAmount: row.discountKind === null ? null : pricing.discountAmount,
          dieselAmount: row.dieselLitres > 0 ? pricing.dieselAmount : row.dieselAmount,
        }),
      });
    }),
  );
}

/**
 * Returns a Priced Job to Completed after a reading amendment moved its hours. Rates, unit amounts, the
 * Diesel price, the Discount and Charge Line amounts stay; every stint amount recomputes from the amended
 * hours and amount overrides are discarded. Runs inside the amendment's transaction, after the machine
 * lock and the reading writes, so the lock order stays machine → job → stint.
 */
export async function reopenPricingWithin(tx: DatabaseTransaction, actorUserId: AuthId, jobId: string, reason: string) {
  const job = await lockJob(tx, jobId);
  if (job.status !== 'priced') throw wrongStatus('Only a Priced Job can be reopened for pricing.');
  const stints = await tx
    .select({
      computedAmount: contractingMachineAssignments.computedAmount,
      finalAmount: contractingMachineAssignments.finalAmount,
    })
    .from(contractingMachineAssignments)
    .where(eq(contractingMachineAssignments.jobId, jobId))
    .for('update');
  const edited = stints.filter((stint) => stint.finalAmount !== stint.computedAmount).length;
  const note = edited
    ? `${reason} ${formatNumber(edited)} edited ${edited === 1 ? 'amount was' : 'amounts were'} reset.`
    : reason;
  const reopened = await writeJob(tx, actorUserId, jobId, {
    set: (row) => transitionJob(row, { type: 'reopen', at: new Date(), note }),
  });
  for (const stint of reopened.assignments)
    if (stint.computedAmount !== null)
      await writeStintPricing(tx, actorUserId, stint.machineCode, stint.id, {
        computedAmount: stint.computedAmount,
        finalAmount: stint.computedAmount,
      });
}
