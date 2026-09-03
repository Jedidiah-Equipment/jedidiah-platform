import {
  currentOwnerCustomerId,
  customers,
  type DatabaseTransaction,
  type Db,
  jobBays,
  jobSlots,
  jobs,
  productUnits,
  quotes,
  stockMovements,
} from '@pkg/db';
import { getPlantDateNow, isReleasableJobSlot, projectJobSlots, resolveUnitRemovalOffer } from '@pkg/domain';
import {
  type CancellationLinkedUnit,
  DateOnlyIso,
  JobCancellationPlan,
  QuoteCancellationPlan,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, isNull } from 'drizzle-orm';

import { JobNotFoundError } from '../jobs/job-errors.js';
import { loadBayWorkingCalendar } from '../jobs/working-calendar-service.js';
import { QuoteNotFoundError } from '../quotes/quote-errors.js';

/**
 * What a cancellation is about to reach, answered once by the server that will carry it out. Both
 * cancel dialogs open on this: the records they name, and which of the optional halves arrive already
 * ticked. Reading it here rather than assembling it per surface is what keeps the Quote dialog and the
 * Job dialog from offering different things about the same machine.
 *
 * This only describes and defaults. Every refusal it anticipates is enforced again by the mutation.
 */

type JobCancellationFacts = {
  completedOn: string | null;
  hasDrawnStock: boolean;
  hasStartedSlot: boolean;
  releasableSlotCount: number;
};

/**
 * Cancelling a Quote may take its live Job, and with it the machine that Job minted. Only a
 * build-to-order Unit is ever offered: an Allocation Quote sells a machine that existed before the sale
 * and outlives it, returning to Stock instead.
 */
export async function getQuoteCancellationPlan({ db, id }: { db: Db; id: UUID }): Promise<QuoteCancellationPlan> {
  const [quote] = await db
    .select({ id: quotes.id, productUnitId: quotes.productUnitId })
    .from(quotes)
    .where(eq(quotes.id, id));

  if (!quote) {
    throw new QuoteNotFoundError(id);
  }

  const [job] = await db
    .select({
      code: jobs.code,
      completedOn: jobs.completedOn,
      description: jobs.description,
      id: jobs.id,
      productUnitId: jobs.productUnitId,
    })
    .from(jobs)
    .where(and(eq(jobs.quoteId, id), isNull(jobs.cancelledAt)));

  if (!job) {
    return QuoteCancellationPlan.parse({ job: null, unit: null });
  }

  const facts = await loadJobCancellationFacts({ completedOn: job.completedOn, jobId: job.id, db });
  const sellsExistingUnit = quote.productUnitId !== null;

  return QuoteCancellationPlan.parse({
    job: {
      code: job.code,
      description: job.description,
      id: job.id,
      releasableSlotCount: facts.releasableSlotCount,
    },
    unit: sellsExistingUnit ? null : await loadLinkedUnit({ db, facts, productUnitId: job.productUnitId }),
  });
}

/**
 * Cancelling a Job may take its machine only when there is no sale behind it. While a Quote stands the
 * Unit is the sale's — cancelling frees the Quote to start a replacement Job on that very machine.
 */
export async function getJobCancellationPlan({ db, id }: { db: Db; id: UUID }): Promise<JobCancellationPlan> {
  const [job] = await db
    .select({
      completedOn: jobs.completedOn,
      id: jobs.id,
      productUnitId: jobs.productUnitId,
      quoteId: jobs.quoteId,
    })
    .from(jobs)
    .where(eq(jobs.id, id));

  if (!job) {
    throw new JobNotFoundError(id);
  }

  const facts = await loadJobCancellationFacts({ completedOn: job.completedOn, jobId: job.id, db });

  return JobCancellationPlan.parse({
    releasableSlotCount: facts.releasableSlotCount,
    unit: job.quoteId !== null ? null : await loadLinkedUnit({ db, facts, productUnitId: job.productUnitId }),
  });
}

async function loadLinkedUnit({
  db,
  facts,
  productUnitId,
}: {
  db: Db;
  facts: JobCancellationFacts;
  productUnitId: string | null;
}): Promise<CancellationLinkedUnit | null> {
  if (!productUnitId) {
    return null;
  }

  const [unit] = await db
    .select({
      ownerName: customers.companyName,
      productSerialNumber: productUnits.productSerialNumber,
    })
    .from(productUnits)
    .leftJoin(customers, eq(customers.id, currentOwnerCustomerId(productUnits.id)))
    .where(eq(productUnits.id, productUnitId));

  if (!unit) {
    return null;
  }

  const offer = resolveUnitRemovalOffer({
    completedOn: facts.completedOn,
    hasDrawnStock: facts.hasDrawnStock,
    hasStartedSlot: facts.hasStartedSlot,
  });

  return {
    canRemove: offer.offered,
    ownerName: unit.ownerName,
    productSerialNumber: unit.productSerialNumber,
    productUnitId,
    removeByDefault: offer.offered && offer.removeByDefault,
  };
}

/**
 * The two signals that say the shop may already have touched this build, plus the Slot count the
 * dialog warns about. A Slot counts as started when cancellation would not give it back, which is the
 * same rule the release path applies.
 */
async function loadJobCancellationFacts({
  completedOn,
  db,
  jobId,
}: {
  completedOn: string | null;
  db: Db;
  jobId: UUID;
}): Promise<JobCancellationFacts> {
  const plantToday = getPlantDateNow();
  const [slots, drawn] = await Promise.all([
    projectJobWorkSlots({ db, jobId }),
    db.$count(stockMovements, and(eq(stockMovements.jobId, jobId), eq(stockMovements.movementType, 'checkout'))),
  ]);

  return {
    completedOn,
    hasDrawnStock: drawn > 0,
    hasStartedSlot: slots.some((slot) => !isReleasableJobSlot({ plantToday, startDate: slot.startDate })),
    releasableSlotCount: slots.filter((slot) => isReleasableJobSlot({ plantToday, startDate: slot.startDate })).length,
  };
}

/** The Job's Work Slots as the Bay schedule actually places them; dates are derived, never stored. */
async function projectJobWorkSlots({
  db,
  jobId,
}: {
  db: Db | DatabaseTransaction;
  jobId: UUID;
}): Promise<{ startDate: DateOnlyIso }[]> {
  const jobBayRows = await db.selectDistinct({ bayId: jobSlots.bayId }).from(jobSlots).where(eq(jobSlots.jobId, jobId));
  const projected: { startDate: DateOnlyIso }[] = [];

  for (const { bayId } of jobBayRows) {
    const [bay] = await db
      .select({ scheduleOrigin: jobBays.scheduleOrigin })
      .from(jobBays)
      .where(eq(jobBays.id, bayId));

    if (!bay) {
      continue;
    }

    const [workingCalendar, baySlots] = await Promise.all([
      loadBayWorkingCalendar(db, bayId),
      db.query.jobSlots.findMany({
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        where: eq(jobSlots.bayId, bayId),
      }),
    ]);
    const bayProjection = projectJobSlots({
      scheduleOrigin: DateOnlyIso.parse(bay.scheduleOrigin),
      slots: baySlots,
      workingCalendar,
    }).slots;

    for (const slot of bayProjection) {
      if (slot.kind === 'work' && slot.jobId === jobId) {
        projected.push({ startDate: slot.startDate });
      }
    }
  }

  return projected;
}
