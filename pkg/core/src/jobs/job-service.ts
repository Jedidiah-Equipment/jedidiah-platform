import {
  type DatabaseTransaction,
  type Db,
  documents,
  jobBuildSpecAssemblies,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  notRemoved,
  productSerialSequences,
  products,
  productUnitOwnershipTransfers,
  productUnits,
  quoteSelectedAssemblies,
  quotes,
} from '@pkg/db';
import {
  type BuildSpecAssembly,
  buildCfo,
  type CfoEntry,
  canStartJobFromQuote,
  getPlantDateNow,
  isJobCancelled,
  projectJobSlots,
} from '@pkg/domain';
import {
  type AddIdleJobSlotInput,
  AddIdleJobSlotResult,
  type AuthId,
  type BookJobSlotInput,
  BookJobSlotResult,
  type BrochurePdfRenderer,
  DateOnlyIso,
  formatJobCode,
  formatProductSerialNumber,
  isStockBuildCreateInput,
  JobCode,
  type JobCreateInput,
  type JobDetail,
  type JobUpdateInput,
  type JobUpdateResult,
  type MoveJobSlotInput,
  MoveJobSlotResult,
  ProductSerialPrefix,
  ProductSerialSequence,
  ProductSerialYear,
  type QuoteOffering,
  type RemoveJobSlotInput,
  RemoveJobSlotResult,
  type ResizeJobSlotInput,
  ResizeJobSlotResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';

import {
  defineAuditDescriptor,
  diffAuditUpdate,
  recordAuditCreate,
  recordAuditDelete,
  recordAuditEvent,
  recordAuditUpdate,
} from '../audit/audit-service.js';
import { documentBaseSelect } from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { snapshotJobBrochureDocument } from '../products/product-brochure-document.js';
import { narrowQuoteOffering } from '../quotes/quote-offering.js';
import { productUnitAuditDescriptor } from '../units/product-unit-service.js';
import { lockBayQueue, lockBayQueueBySlot } from './bay-queue.js';
import { jobBayAuditDescriptor } from './job-bay-service.js';
import {
  JobCompletedOnInFutureError,
  JobCreateFromQuoteDeniedError,
  JobNotFoundError,
  JobSlotNotFoundError,
  StockBuildDeniedError,
} from './job-errors.js';
import { type JobProductUnitRow, type JobRow, mapJob } from './job-mappers.js';
import { assertJobIsMutable, lockMutableJob } from './job-mutation-guards.js';
import { getJob } from './job-read-service.js';
import { loadBayWorkingCalendar } from './working-calendar-service.js';

type QuoteRow = typeof quotes.$inferSelect;

// A Job's inputs resolved once at the input boundary. `kind` alone drives every downstream branch: the
// machine-building variants carry the serial + Build Spec facts a custom Job never has, so no site
// re-derives them, and only `quote` says whether there is a sale behind the work.
type JobBlueprint =
  | {
      kind: 'product';
      quote: QuoteRow;
      productId: UUID;
      serial: Awaited<ReturnType<typeof createProductSerial>>;
      buildSpec: BuildSpecAssembly[];
    }
  | {
      kind: 'stock-build';
      quote: null;
      productId: UUID;
      serial: Awaited<ReturnType<typeof createProductSerial>>;
      buildSpec: BuildSpecAssembly[];
    }
  | { kind: 'custom'; quote: QuoteRow };

/** The Job kinds that build a machine, and so mint a Unit, a Build Spec, a CFO, and Documents. */
function buildsProductUnit(blueprint: JobBlueprint): blueprint is Extract<JobBlueprint, { productId: UUID }> {
  return blueprint.kind !== 'custom';
}

export const jobAuditDescriptor = defineAuditDescriptor<JobRow>({
  entityType: 'job',
  noun: 'job',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatJobAuditLabel,
  entityId: (row) => row.id,
  label: (row) => row.code,
  toRecord: (row) => ({
    completedOn: row.completedOn,
    description: row.description,
    invoiceNumber: row.invoiceNumber,
    productUnitId: row.productUnitId,
    quoteId: row.quoteId,
  }),
});

function formatJobAuditLabel(value: unknown): string {
  if (typeof value === 'number') {
    return formatJobCode(value);
  }

  const result = JobCode.safeParse(value);

  return result.success ? result.data : String(value);
}

export async function createJob({
  actorUserId,
  brochureRenderer,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  input: JobCreateInput;
  storage: StorageAdapter;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const plantToday = getPlantDateNow();
    const blueprint = await resolveJobBlueprint({ input, plantToday, tx });

    // The physical machine is created before the Job that builds it: the Unit owns the serial, the
    // Product, and the VIN, and pointing at one is what makes this a Product Job.
    const productUnitId = buildsProductUnit(blueprint) ? await insertProductUnit({ actorUserId, blueprint, tx }) : null;

    const [job] = await tx
      .insert(jobs)
      .values({
        productUnitId,
        quoteId: blueprint.quote?.id ?? null,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    // Only a sale attributes the machine to anyone. A Stock Build leaves the log empty, which is
    // exactly what makes its Unit read as Stock.
    if (productUnitId && blueprint.quote) {
      await tx.insert(productUnitOwnershipTransfers).values({
        actorUserId,
        occurredOn: plantToday,
        productUnitId,
        sourceQuoteId: blueprint.quote.id,
        toCustomerId: blueprint.quote.customerId,
      });
    }

    if (buildsProductUnit(blueprint)) {
      // A Quote's selected Assemblies seed the Job's own Build Spec — one copy at one moment — and a
      // Stock Build enters one directly. Either way the CFO snapshots from that Build Spec.
      await insertJobBuildSpec({ buildSpec: blueprint.buildSpec, jobId: job.id, tx });
      await snapshotJobCfo({ jobId: job.id, productId: blueprint.productId, tx });
    }

    // Canonical lock order: concurrent creates seeding the same Bays must not deadlock.
    const seeds = [...input.baySeeds].sort((left, right) => left.bayId.localeCompare(right.bayId));

    for (const seed of seeds) {
      const queue = await lockBayQueue(tx, seed.bayId, { plantToday });

      await queue.book({ durationDays: seed.durationDays, jobId: job.id, kind: 'work' }, { startDate: seed.startDate });
    }

    if (buildsProductUnit(blueprint)) {
      // Snapshot documents only after the abort-prone bay seeding succeeds: generating the Brochure
      // writes a PDF to (non-transactional) storage, so a later rollback would orphan that object.
      await snapshotJobDocuments({
        actorUserId,
        brochureRenderer,
        db,
        jobId: job.id,
        productId: blueprint.productId,
        storage,
        tx,
      });
    }

    await recordAuditCreate({ db: tx, descriptor: jobAuditDescriptor, actorUserId, input: job });

    return getJob({ db: tx, id: job.id });
  });
}

export async function cancelJobForQuote({
  actorUserId,
  now,
  plantToday,
  quoteId,
  tx,
}: {
  actorUserId: AuthId;
  now: Date;
  plantToday: DateOnlyIso;
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [job] = await tx.select().from(jobs).where(eq(jobs.quoteId, quoteId)).for('update');

  if (!job || isJobCancelled(job)) {
    return;
  }

  const slots = await tx.select().from(jobSlots).where(eq(jobSlots.jobId, job.id));
  const bayIds = [...new Set(slots.map((slot) => slot.bayId))].sort();

  // Bay locks are taken in a stable order so a multi-Bay cancellation cannot deadlock another
  // queue mutation that touches the same set of Bays.
  for (const bayId of bayIds) {
    const queue = await lockBayQueue(tx, bayId, { plantToday });
    const [workingCalendar, baySlots] = await Promise.all([
      loadBayWorkingCalendar(tx, bayId),
      tx.query.jobSlots.findMany({
        orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
        where: eq(jobSlots.bayId, bayId),
      }),
    ]);
    const projectedSlots = projectJobSlots({
      scheduleOrigin: DateOnlyIso.parse(queue.bay.scheduleOrigin),
      slots: baySlots,
      workingCalendar,
    }).slots;

    for (const slot of projectedSlots.filter((slot) => slot.kind === 'work' && slot.jobId === job.id)) {
      if (slot.startDate > plantToday) {
        await queue.remove(slot.id);
      }
    }
  }

  await tx.update(jobs).set({ cancelledAt: now, updatedAt: now }).where(eq(jobs.id, job.id));
  await recordAuditDelete({ db: tx, descriptor: jobAuditDescriptor, actorUserId, input: job });
}

async function resolveJobBlueprint({
  input,
  plantToday,
  tx,
}: {
  input: JobCreateInput;
  plantToday: DateOnlyIso;
  tx: DatabaseTransaction;
}): Promise<JobBlueprint> {
  if (isStockBuildCreateInput(input)) {
    const buildSpec = await resolveStockBuildSpec({
      assemblyIds: input.buildSpecAssemblyIds,
      productId: input.productId,
      tx,
    });

    return {
      kind: 'stock-build',
      quote: null,
      productId: input.productId,
      serial: await createProductSerial({ plantToday, productId: input.productId, tx }),
      buildSpec,
    };
  }

  const { offering, quote } = await validateJobQuoteForCreate({ quoteId: input.quoteId, tx });

  if (offering.kind === 'custom') {
    return { kind: 'custom', quote };
  }

  const buildSpec = await loadQuoteBuildSpecSeed({ quoteId: quote.id, tx });
  const serial = await createProductSerial({ plantToday, productId: offering.productId, tx });

  return { kind: 'product', quote, productId: offering.productId, serial, buildSpec };
}

/**
 * A Stock Build's Build Spec, resolved from the Optional Assemblies the administrator picked. The name
 * is snapshotted here for the same reason a Quote's is: the CFO and the As-Built Spec must keep saying
 * what was fitted after the catalog entry is renamed.
 */
async function resolveStockBuildSpec({
  assemblyIds,
  productId,
  tx,
}: {
  assemblyIds: readonly UUID[];
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<BuildSpecAssembly[]> {
  // A removed Product is gone from the picker, so a Stock Build naming one is a stale tab or a
  // hand-made request — never something we should mint a serial and a machine for.
  const [product] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), notRemoved(products)))
    .limit(1);

  if (!product) {
    throw new StockBuildDeniedError('Product not found.');
  }

  const uniqueIds = [...new Set(assemblyIds)];

  if (uniqueIds.length === 0) {
    return [];
  }

  const optionalAssembliesById = new Map(
    (await listAssemblies({ productId, tx }))
      .filter((assembly) => assembly.kind === 'optional')
      .map((assembly) => [assembly.id, assembly] as const),
  );
  const unknown = uniqueIds.filter((assemblyId) => !optionalAssembliesById.has(assemblyId));

  if (unknown.length > 0) {
    throw new StockBuildDeniedError(`Optional assembly does not belong to this Product: ${unknown.join(', ')}.`);
  }

  return uniqueIds.map((assemblyId) => ({
    // Non-null by construction: `unknown` above already rejected every id the catalog does not hold.
    assemblyName: optionalAssembliesById.get(assemblyId)?.name ?? '',
    productAssemblyId: assemblyId,
  }));
}

async function loadJobProductUnit({
  productUnitId,
  tx,
}: {
  productUnitId: string | null;
  tx: DatabaseTransaction;
}): Promise<JobProductUnitRow | null> {
  if (!productUnitId) return null;

  const [unit] = await tx
    .select({
      productId: productUnits.productId,
      productSerialNumber: productUnits.productSerialNumber,
      productSerialPrefix: productUnits.productSerialPrefix,
      productSerialSequence: productUnits.productSerialSequence,
      productSerialYear: productUnits.productSerialYear,
      vinNumber: productUnits.vinNumber,
    })
    .from(productUnits)
    .where(eq(productUnits.id, productUnitId));

  return unit ? { ...unit, product: { id: unit.productId } } : null;
}

async function insertProductUnit({
  actorUserId,
  blueprint,
  tx,
}: {
  actorUserId: AuthId;
  blueprint: Extract<JobBlueprint, { productId: UUID }>;
  tx: DatabaseTransaction;
}): Promise<string> {
  const [unit] = await tx
    .insert(productUnits)
    .values({
      productId: blueprint.productId,
      productSerialNumber: blueprint.serial.number,
      productSerialPrefix: blueprint.serial.prefix,
      productSerialSequence: blueprint.serial.sequence,
      productSerialYear: blueprint.serial.year,
    })
    .returning();

  if (!unit) {
    throw new Error('Product unit insert did not return a row');
  }

  await recordAuditCreate({ db: tx, descriptor: productUnitAuditDescriptor, actorUserId, input: unit });

  return unit.id;
}

export async function updateJob({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: JobUpdateInput;
}): Promise<JobUpdateResult> {
  const plantToday = getPlantDateNow();

  if (input.completedOn != null && input.completedOn > plantToday) {
    throw new JobCompletedOnInFutureError(input.completedOn, plantToday);
  }

  return applyJobFieldPatch({
    actorUserId,
    db,
    id: input.id,
    patch: {
      // Omitted entirely when the caller did not send the key, so the stored date survives — a
      // spread `undefined` would still overwrite it in the audit diff.
      ...(input.completedOn === undefined ? {} : { completedOn: input.completedOn }),
      description: input.description,
      invoiceNumber: input.invoiceNumber,
    },
  });
}

async function applyJobFieldPatch({
  actorUserId,
  db,
  id,
  patch,
}: {
  actorUserId: AuthId;
  db: Db;
  id: UUID;
  patch: Partial<Pick<JobRow, 'completedOn' | 'description' | 'invoiceNumber'>>;
}): Promise<JobUpdateResult> {
  return db.transaction(async (tx) => {
    const before = await lockMutableJob(tx, id);

    const after = { ...before, ...patch };
    const changes = diffAuditUpdate(jobAuditDescriptor, before, after);

    if (!changes) {
      return { job: mapJob(before, await loadJobProductUnit({ productUnitId: before.productUnitId, tx })) };
    }

    const [row] = await tx
      .update(jobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();

    if (!row) {
      throw new JobNotFoundError(id);
    }

    await recordAuditUpdate({ db: tx, descriptor: jobAuditDescriptor, actorUserId, after: row, changes });

    return { job: mapJob(row, await loadJobProductUnit({ productUnitId: row.productUnitId, tx })) };
  });
}

export async function bookJobSlot({ db, input }: { db: Db; input: BookJobSlotInput }): Promise<BookJobSlotResult> {
  return db.transaction(async (tx) => {
    const plantToday = getPlantDateNow();
    const job = await lockMutableJob(tx, input.jobId);

    const queue = await lockBayQueue(tx, input.bayId, { plantToday });
    const slot = await queue.book(
      { durationDays: input.durationDays, jobId: job.id, kind: 'work' },
      { startDate: input.startDate },
    );

    return BookJobSlotResult.parse({ slot });
  });
}

export async function addIdleJobSlot({
  db,
  input,
}: {
  db: Db;
  input: AddIdleJobSlotInput;
}): Promise<AddIdleJobSlotResult> {
  return db.transaction(async (tx) => {
    await assertTargetSlotJobIsMutable(tx, input.targetSlotId);
    const queue = await lockBayQueueBySlot(tx, input.targetSlotId);
    const slot = await queue.insertRelative(input.targetSlotId, input.placement, {
      durationDays: input.durationDays,
      kind: 'idle',
      label: input.label ?? null,
    });

    return AddIdleJobSlotResult.parse({ slot });
  });
}

async function assertTargetSlotJobIsMutable(tx: DatabaseTransaction, slotId: UUID): Promise<void> {
  const [slot] = await tx.select({ jobId: jobSlots.jobId }).from(jobSlots).where(eq(jobSlots.id, slotId));

  if (!slot) {
    throw new JobSlotNotFoundError(slotId);
  }

  if (!slot.jobId) {
    return;
  }

  await lockMutableJob(tx, slot.jobId);
}

async function assertMoveParticipantsAreMutable(
  tx: DatabaseTransaction,
  slotId: UUID,
  direction: MoveJobSlotInput['direction'],
): Promise<void> {
  const [slot] = await tx
    .select({ bayId: jobSlots.bayId, jobId: jobSlots.jobId, sequence: jobSlots.sequence })
    .from(jobSlots)
    .where(eq(jobSlots.id, slotId));

  if (!slot) {
    throw new JobSlotNotFoundError(slotId);
  }

  const movingLeft = direction === 'left';
  const [adjacent] = await tx
    .select({ jobId: jobSlots.jobId })
    .from(jobSlots)
    .where(
      and(
        eq(jobSlots.bayId, slot.bayId),
        movingLeft ? lt(jobSlots.sequence, slot.sequence) : gt(jobSlots.sequence, slot.sequence),
      ),
    )
    .orderBy(movingLeft ? desc(jobSlots.sequence) : asc(jobSlots.sequence))
    .limit(1);

  const jobIds = [...new Set([slot.jobId, adjacent?.jobId].filter((jobId): jobId is UUID => jobId != null))];
  const jobRows = jobIds.length
    ? await tx.select({ cancelledAt: jobs.cancelledAt, id: jobs.id }).from(jobs).where(inArray(jobs.id, jobIds))
    : [];
  const jobsById = new Map(jobRows.map((job) => [job.id, job]));

  for (const jobId of jobIds) {
    const job = jobsById.get(jobId);
    if (!job) throw new JobNotFoundError(jobId);
    assertJobIsMutable(job);
  }
}

export async function resizeJobSlot({
  db,
  input,
}: {
  db: Db;
  input: ResizeJobSlotInput;
}): Promise<ResizeJobSlotResult> {
  return db.transaction(async (tx) => {
    await assertTargetSlotJobIsMutable(tx, input.slotId);
    const queue = await lockBayQueueBySlot(tx, input.slotId);
    const slot = await queue.resize(input.slotId, input.durationDays);

    return ResizeJobSlotResult.parse({ slot });
  });
}

export async function moveJobSlot({
  actorUserId,
  db,
  input,
}: {
  actorUserId: AuthId;
  db: Db;
  input: MoveJobSlotInput;
}): Promise<MoveJobSlotResult> {
  return db.transaction(async (tx) => {
    const queue = await lockBayQueueBySlot(tx, input.slotId);
    // The Bay lock freezes adjacency; cancellation must cross the same lock before it can commit its queue changes.
    await assertMoveParticipantsAreMutable(tx, input.slotId, input.direction);
    const { slot, swapped } = await queue.swap(input.slotId, input.direction);

    if (swapped) {
      await recordAuditEvent({
        action: 'updated',
        actorUserId,
        changes: {
          slotOrder: {
            from: swapped.beforeSlotOrder,
            to: swapped.afterSlotOrder,
          },
        },
        db: tx,
        descriptor: jobBayAuditDescriptor,
        entityId: queue.bay.id,
        record: { name: queue.bay.name },
      });
    }

    return MoveJobSlotResult.parse({ slot });
  });
}

export async function removeJobSlot({
  db,
  input,
}: {
  db: Db;
  input: RemoveJobSlotInput;
}): Promise<RemoveJobSlotResult> {
  return db.transaction(async (tx) => {
    const queue = await lockBayQueueBySlot(tx, input.slotId);
    const slot = await queue.remove(input.slotId);

    return RemoveJobSlotResult.parse({ slot });
  });
}

async function createProductSerial({
  productId,
  tx,
  plantToday,
}: {
  productId: UUID;
  tx: DatabaseTransaction;
  plantToday: DateOnlyIso;
}) {
  const now = new Date();
  const [product] = await tx
    .select({
      modelCode: products.modelCode,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw new JobCreateFromQuoteDeniedError('Product not found.');
  }

  const [sequenceRow] = await tx
    .insert(productSerialSequences)
    .values({
      lastSequence: 1,
      productId,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: productSerialSequences.productId,
      set: {
        lastSequence: sql`${productSerialSequences.lastSequence} + 1`,
        updatedAt: now,
      },
    })
    .returning({
      lastSequence: productSerialSequences.lastSequence,
    });

  if (!sequenceRow) {
    throw new Error('Product serial sequence upsert did not return a row');
  }

  const prefix = ProductSerialPrefix.parse(product.modelCode);
  const year = ProductSerialYear.parse(getPlantDateTwoDigitYear(plantToday));
  const sequence = ProductSerialSequence.parse(sequenceRow.lastSequence);

  return {
    number: formatProductSerialNumber({ prefix, sequence, year }),
    prefix,
    sequence,
    year,
  };
}

function getPlantDateTwoDigitYear(plantDate: DateOnlyIso): number {
  return Number.parseInt(plantDate.slice(2, 4), 10);
}

async function validateJobQuoteForCreate({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<{ offering: QuoteOffering; quote: QuoteRow }> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  const offering = narrowQuoteOffering(quote);

  const [existingJob] = await tx
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .limit(1);
  const eligibility = canStartJobFromQuote({
    hasJob: Boolean(existingJob),
    kind: offering.kind,
    status: quote.status,
  });

  if (!eligibility.allowed) {
    throw new JobCreateFromQuoteDeniedError(eligibility.reason);
  }

  return { offering, quote };
}

/**
 * The Quote's selected Assemblies, as the Build Spec they seed. A copy at one moment, in the Quote's
 * own selection order — never a live read, exactly like the Work Item Rate Card seeding a rate.
 */
async function loadQuoteBuildSpecSeed({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<BuildSpecAssembly[]> {
  return tx
    .select({
      assemblyName: quoteSelectedAssemblies.quotedName,
      productAssemblyId: quoteSelectedAssemblies.productAssemblyId,
    })
    .from(quoteSelectedAssemblies)
    .where(eq(quoteSelectedAssemblies.quoteId, quoteId))
    .orderBy(asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id));
}

async function insertJobBuildSpec({
  buildSpec,
  jobId,
  tx,
}: {
  buildSpec: readonly BuildSpecAssembly[];
  jobId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  if (buildSpec.length === 0) {
    return;
  }

  await tx.insert(jobBuildSpecAssemblies).values(
    buildSpec.map((assembly, index) => ({
      assemblyName: assembly.assemblyName,
      jobId,
      productAssemblyId: assembly.productAssemblyId,
      sequence: index,
    })),
  );
}

/**
 * The one path that produces a CFO. It reads the Job's Build Spec and the Product's live catalog and
 * writes the frozen result, so however a Job was specced — seeded from a Quote or entered directly —
 * its CFO comes from the same source through the same code.
 *
 * A stale selection denies Job creation, aborting the enclosing transaction.
 */
async function snapshotJobCfo({
  jobId,
  productId,
  tx,
}: {
  jobId: UUID;
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const [catalogAssemblies, buildSpec] = await Promise.all([
    listAssemblies({ productId, tx }),
    tx
      .select({
        assemblyName: jobBuildSpecAssemblies.assemblyName,
        productAssemblyId: jobBuildSpecAssemblies.productAssemblyId,
      })
      .from(jobBuildSpecAssemblies)
      .where(eq(jobBuildSpecAssemblies.jobId, jobId))
      .orderBy(asc(jobBuildSpecAssemblies.sequence)),
  ]);

  const result = buildCfo({ buildSpec, catalogAssemblies });

  if (!result.ok) {
    throw new JobCreateFromQuoteDeniedError(
      `Selected optional assembly is stale: ${result.staleAssemblyNames.join(', ')}.`,
    );
  }

  // Freeze the build order: standards in catalog display order, then specced optionals in the
  // order resolveEffectiveBom produces. Densely sequenced per kind so the CFO read reproduces it.
  const sequenceByKind: Record<CfoEntry['kind'], number> = { optional: 0, standard: 0 };

  for (const assembly of result.cfo) {
    const [cfoAssembly] = await tx
      .insert(jobCfoAssemblies)
      .values({
        assemblyName: assembly.assemblyName,
        jobId,
        kind: assembly.kind,
        sequence: sequenceByKind[assembly.kind]++,
      })
      .returning({ id: jobCfoAssemblies.id });

    if (!cfoAssembly) {
      throw new Error('Job CFO assembly insert did not return a row');
    }

    if (assembly.parts.length > 0) {
      await tx.insert(jobCfoParts).values(
        assembly.parts.map((part) => ({
          cfoAssemblyId: cfoAssembly.id,
          partId: part.partId,
          quantity: part.quantity,
        })),
      );
    }
  }
}

/**
 * Freezes a Job's documents at creation time. The uploaded Product Documents are
 * snapshot-copied as immutable job-owned rows that point at the same stored object, while the Brochure
 * is generated fresh from the Product's live config (via the injected {@link BrochurePdfRenderer}) and
 * saved as a standalone immutable Job Document. A later edit to the Product's brochure config never
 * changes an already-saved Job Document; when the config is incomplete, no Brochure Job Document is
 * created — consistent with the shared completeness gate.
 */
export async function snapshotJobDocuments({
  actorUserId,
  brochureRenderer,
  db,
  jobId,
  productId,
  storage,
  tx,
}: {
  actorUserId: AuthId;
  brochureRenderer: BrochurePdfRenderer;
  db: Db;
  jobId: UUID;
  productId: UUID;
  storage: StorageAdapter;
  tx: DatabaseTransaction;
}): Promise<void> {
  await copyUploadedProductDocuments({ jobId, productId, tx });
  await snapshotJobBrochureDocument({ actorUserId, db, jobId, pdfRenderer: brochureRenderer, productId, storage, tx });
}

async function copyUploadedProductDocuments({
  jobId,
  productId,
  tx,
}: {
  jobId: UUID;
  productId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  const productDocuments = await tx
    .select(documentBaseSelect)
    .from(documents)
    .where(eq(documents.productId, productId))
    .orderBy(asc(documents.filename), asc(documents.id));

  if (productDocuments.length === 0) {
    return;
  }

  await tx.insert(documents).values(
    productDocuments.map((document) => ({
      byteSize: document.byteSize,
      contentType: document.contentType,
      filename: document.filename,
      jobId,
      metadata: document.metadata,
      ownerType: 'job' as const,
      sourceProductId: productId,
      storageKey: document.storageKey,
      uploaderUserId: document.uploaderUserId,
    })),
  );
}
