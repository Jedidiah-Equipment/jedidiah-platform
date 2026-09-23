import type { DatabaseTransaction, Db } from '@pkg/db';
import { contractingJobs, contractingMachineAssignments, contractingMachines } from '@pkg/db/contracting';
import { formatNumber } from '@pkg/domain';
import { computeDieselAmount, computeDiscountAmount, priceStint, pricingGateReasons } from '@pkg/domain/contracting';
import type { AuthId } from '@pkg/schema';
import type {
  Assignment,
  DieselPriceInput,
  DiscountSetInput,
  JobMarkPricedInput,
  JobPricing,
  StintAmountSetInput,
  StintRateClearInput,
  StintRateSetInput,
} from '@pkg/schema/contracting';
import { eq } from 'drizzle-orm';
import { mutateEntity } from '../../audit/mutate-entity.js';
import { isRateCardError } from '../rate-card/rate-card-errors.js';
import { getRate } from '../rate-card/rate-service.js';
import { assignmentDescriptor } from './assignment-service.js';
import { JobError, jobNotFound, withJobConstraints, wrongStatus } from './job-errors.js';
import { lockJob } from './job-lock.js';
import { getJob } from './job-read.js';
import { jobDescriptor } from './job-service.js';

type JobRow = typeof contractingJobs.$inferSelect;
type StintPricing = Pick<
  typeof contractingMachineAssignments.$inferInsert,
  'rateId' | 'rateName' | 'rateBasis' | 'rateMeasureTypeId' | 'rateUnitAmount' | 'computedAmount' | 'finalAmount'
>;

function assertPricingOpen(job: Pick<JobRow, 'status'>) {
  if (job.status !== 'completed') throw wrongStatus('Pricing is only possible on a Completed Job.');
}

const isPriced = (stint: Pick<Assignment, 'rateUnitAmount'>) => stint.rateUnitAmount !== null;

async function stintRef(tx: DatabaseTransaction, assignmentId: string) {
  const [reference] = await tx
    .select({
      jobId: contractingMachineAssignments.jobId,
      machineId: contractingMachineAssignments.machineId,
      machineCode: contractingMachines.code,
    })
    .from(contractingMachineAssignments)
    .innerJoin(contractingMachines, eq(contractingMachines.id, contractingMachineAssignments.machineId))
    .where(eq(contractingMachineAssignments.id, assignmentId));
  if (!reference) throw jobNotFound('Machine Assignment');
  return reference;
}

/** Locks the stint's Job, checks Pricing is open, and returns the live read of the Job and the stint. */
async function openStint(tx: DatabaseTransaction, assignmentId: string) {
  const reference = await stintRef(tx, assignmentId);
  assertPricingOpen(await lockJob(tx, reference.jobId));
  const job = await getJob({ db: tx, id: reference.jobId });
  const stint = job.assignments.find((assignment) => assignment.id === assignmentId);
  if (stint?.state !== 'left') throw jobNotFound('Machine Assignment');
  return { reference, job, stint };
}

function writeStintPricing(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  machineCode: string,
  id: string,
  values: StintPricing,
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: assignmentDescriptor(machineCode),
    table: contractingMachineAssignments,
    id,
    notFound: () => jobNotFound('Machine Assignment'),
    set: () => ({ ...values, updatedAt: new Date() }),
    project: () => undefined,
  });
}

function writeJob(
  tx: DatabaseTransaction,
  actorUserId: AuthId,
  id: string,
  {
    assert,
    set,
  }: {
    assert?: (tx: DatabaseTransaction, before: JobRow) => Promise<void> | void;
    set: (before: JobRow) => Partial<typeof contractingJobs.$inferInsert>;
  },
) {
  return mutateEntity({
    db: tx,
    actorUserId,
    descriptor: jobDescriptor,
    table: contractingJobs,
    id,
    notFound: jobNotFound,
    ...(assert ? { assert } : {}),
    set: (before) => ({ ...set(before), updatedAt: new Date() }),
    project: (innerTx, row) => getJob({ db: innerTx, id: row.id }),
  });
}

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
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: StintRateSetInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { reference, job } = await openStint(tx, input.assignmentId);
      const rate = input.rateId ? await findRate(tx, input.rateId) : null;
      if (rate && !rate.active)
        throw new JobError('contracting_job.rate_inactive', 'That Rate is no longer active. Pick another.');
      // The read model orders stints by arrival, so the first of the machine's stints is its first stint.
      const stints = job.assignments.filter(
        (assignment) => assignment.machineId === reference.machineId && assignment.state === 'left',
      );
      const targets =
        stints[0]?.id === input.assignmentId
          ? stints.filter((stint) => stint.id === input.assignmentId || !isPriced(stint))
          : stints.filter((stint) => stint.id === input.assignmentId);
      const snapshot = rate
        ? {
            rateId: rate.id,
            rateName: rate.name,
            rateBasis: rate.basis,
            rateMeasureTypeId: rate.measureTypeId,
            rateUnitAmount: rate.amount,
          }
        : { rateId: null, rateName: null, rateBasis: null, rateMeasureTypeId: null, rateUnitAmount: 0 };
      for (const stint of targets) {
        const { computedAmount } = priceStint({
          basis: snapshot.rateBasis,
          unitAmount: snapshot.rateUnitAmount,
          measureTypeId: snapshot.rateMeasureTypeId,
          billableHours: stint.billableHours,
          measures: stint.measures,
        });
        // Final and computed are written equal, so choosing a Rate discards any amount override.
        await writeStintPricing(tx, actorUserId, reference.machineCode, stint.id, {
          ...snapshot,
          computedAmount,
          finalAmount: computedAmount,
        });
      }
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function clearStintRate({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: StintRateClearInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { reference, job } = await openStint(tx, input.assignmentId);
      await writeStintPricing(tx, actorUserId, reference.machineCode, input.assignmentId, {
        rateId: null,
        rateName: null,
        rateBasis: null,
        rateMeasureTypeId: null,
        rateUnitAmount: null,
        computedAmount: null,
        finalAmount: null,
      });
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function setStintAmount({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: StintAmountSetInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      const { reference, job, stint } = await openStint(tx, input.assignmentId);
      if (!isPriced(stint) || stint.computedAmount === null)
        throw wrongStatus('Pick a Rate before changing the amount.');
      if (stint.rateBasis === null) throw wrongStatus('A No charge line is included in the quote and bills nothing.');
      // Computed is rewritten to the live figure in the same write, so final ≠ computed stays the override test.
      await writeStintPricing(tx, actorUserId, reference.machineCode, stint.id, {
        computedAmount: stint.computedAmount,
        finalAmount: input.finalAmount ?? stint.computedAmount,
      });
      return getJob({ db: tx, id: job.id });
    }),
  );
}

export async function setDieselPrice({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: DieselPriceInput;
}) {
  return withJobConstraints(() =>
    db.transaction((tx) =>
      writeJob(tx, actorUserId, input.jobId, {
        assert: (_tx, before) => {
          assertPricingOpen(before);
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
    ),
  );
}

export async function setDiscount({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: DiscountSetInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      assertPricingOpen(await lockJob(tx, input.jobId));
      const { discount } = input;
      const live = (await getJob({ db: tx, id: input.jobId })).pricing;
      return writeJob(tx, actorUserId, input.jobId, {
        set: () =>
          discount === null || live === null
            ? { discountKind: null, discountValue: null, discountAmount: null }
            : {
                discountKind: discount.kind,
                discountValue: discount.value,
                // Kept current for the audit trail; the read model recomputes it while Completed.
                discountAmount: computeDiscountAmount(live.subtotal, discount),
              },
      });
    }),
  );
}

export async function markPriced({
  db,
  actorUserId,
  input,
}: {
  db: Db;
  actorUserId: AuthId;
  input: JobMarkPricedInput;
}) {
  return withJobConstraints(() =>
    db.transaction(async (tx) => {
      let frozen: JobPricing | undefined;
      return writeJob(tx, actorUserId, input.id, {
        assert: async (innerTx, before) => {
          if (before.status !== 'completed') throw wrongStatus('Only a Completed Job can be priced.');
          const detail = await getJob({ db: innerTx, id: before.id });
          const pricing = detail.pricing;
          if (!pricing) throw new Error('A Completed Job always carries its pricing.');
          if (!pricing.gate.ok)
            throw new JobError(
              'contracting_job.pricing_incomplete',
              `This Job cannot be priced yet: ${pricingGateReasons(pricing.gate).join(' · ')}.`,
            );
          if (pricing.total !== input.expectedTotal)
            throw new JobError(
              'contracting_job.total_changed',
              'The total changed while you were pricing. Review it and mark as Priced again.',
            );
          // The live figures become the snapshot: from here the read model trusts the stored amounts.
          for (const stint of detail.assignments)
            if (stint.state === 'left' && stint.computedAmount !== null && stint.finalAmount !== null)
              await writeStintPricing(innerTx, actorUserId, stint.machineCode, stint.id, {
                computedAmount: stint.computedAmount,
                finalAmount: stint.finalAmount,
              });
          frozen = pricing;
        },
        set: (before) => {
          if (!frozen) throw new Error('Mark as Priced ran without its gate.');
          const now = new Date();
          return {
            status: 'priced',
            pricedAt: now,
            pricedByUserId: actorUserId,
            pricedSubtotal: frozen.subtotal,
            pricedTotal: frozen.total,
            discountAmount: before.discountKind === null ? null : frozen.discountAmount,
            dieselAmount: before.dieselLitres > 0 ? frozen.dieselAmount : before.dieselAmount,
            reopenedAt: null,
            repricingNote: null,
          };
        },
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
  const stints = await tx
    .select({
      id: contractingMachineAssignments.id,
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
    assert: (_tx, before) => {
      if (before.status !== 'priced') throw wrongStatus('Only a Priced Job can be reopened for pricing.');
    },
    set: () => ({
      status: 'completed',
      pricedAt: null,
      pricedByUserId: null,
      pricedSubtotal: null,
      pricedTotal: null,
      reopenedAt: new Date(),
      repricingNote: note,
    }),
  });
  for (const stint of reopened.assignments)
    if (stint.computedAmount !== null)
      await writeStintPricing(tx, actorUserId, stint.machineCode, stint.id, {
        computedAmount: stint.computedAmount,
        finalAmount: stint.computedAmount,
      });
}
