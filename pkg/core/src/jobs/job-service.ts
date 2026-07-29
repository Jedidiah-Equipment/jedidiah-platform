import {
  type DatabaseTransaction,
  type Db,
  documents,
  jobBuildSpecAssemblies,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  productUnits,
} from '@pkg/db';
import {
  type BuildSpecAssembly,
  buildCfo,
  buildReworkCfo,
  type CfoEntry,
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
  JobCode,
  type JobCreateInput,
  type JobDetail,
  type JobUpdateInput,
  type JobUpdateResult,
  type MoveJobSlotInput,
  MoveJobSlotResult,
  type RemoveJobSlotInput,
  RemoveJobSlotResult,
  type ResizeJobSlotInput,
  ResizeJobSlotResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';

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
import { appendOwnershipTransfer, productUnitAuditDescriptor } from '../units/product-unit-service.js';
import { lockBayQueue, lockBayQueueBySlot } from './bay-queue.js';
import { jobBayAuditDescriptor } from './job-bay-service.js';
import { createsProductUnit, hasProductWork, type JobBlueprint, resolveJobBlueprint } from './job-blueprint.js';
import {
  JobCompletedOnInFutureError,
  JobCreateFromQuoteDeniedError,
  JobNotFoundError,
  JobSlotNotFoundError,
} from './job-errors.js';
import { type JobProductUnitRow, type JobRow, mapJob } from './job-mappers.js';
import { assertJobIsMutable, lockMutableJob } from './job-mutation-guards.js';
import { getJob } from './job-read-service.js';
import { loadBayWorkingCalendar } from './working-calendar-service.js';

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

    const productUnit = createsProductUnit(blueprint) ? await insertProductUnit({ actorUserId, blueprint, tx }) : null;
    const productUnitId = productUnit?.id ?? (blueprint.kind === 'rework' ? blueprint.productUnitId : null);

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

    // A build-to-order sale creates its Unit and initial ownership together. Allocation acceptance
    // already transferred the existing Unit; Rework must not record that sale a second time. The Unit
    // is new, so there is no competing owner to lock against — only the log and audit event to write.
    if (productUnit && blueprint.kind === 'product') {
      await appendOwnershipTransfer({
        actorUserId,
        fromCustomerId: null,
        occurredOn: plantToday,
        sourceQuoteId: blueprint.quote.id,
        toCustomerId: blueprint.quote.customerId,
        tx,
        unit: productUnit,
      });
    }

    if (hasProductWork(blueprint)) {
      // A Quote's selected Assemblies seed the Job's own Build Spec — one copy at one moment — and a
      // Stock Build enters one directly. Rework carries only the difference from the Unit's As-Built Spec.
      await insertJobBuildSpec({ buildSpec: blueprint.buildSpec, jobId: job.id, tx });
      await snapshotJobCfo({
        jobId: job.id,
        kind: blueprint.kind === 'rework' ? 'rework' : 'build',
        productId: blueprint.productId,
        tx,
      });
    }

    // Canonical lock order: concurrent creates seeding the same Bays must not deadlock.
    const seeds = [...input.baySeeds].sort((left, right) => left.bayId.localeCompare(right.bayId));

    for (const seed of seeds) {
      const queue = await lockBayQueue(tx, seed.bayId, { plantToday });

      await queue.book({ durationDays: seed.durationDays, jobId: job.id, kind: 'work' }, { startDate: seed.startDate });
    }

    if (createsProductUnit(blueprint)) {
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
  blueprint: Extract<JobBlueprint, { kind: 'product' | 'stock-build' }>;
  tx: DatabaseTransaction;
}): Promise<typeof productUnits.$inferSelect> {
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

  return unit;
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
  patch: Partial<Pick<JobRow, 'completedOn' | 'description'>>;
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
 * writes the frozen result. Builds include the effective base BOM; Rework includes only the Optional
 * Assemblies in its difference Build Spec.
 *
 * A stale selection denies Job creation, aborting the enclosing transaction.
 */
async function snapshotJobCfo({
  jobId,
  kind,
  productId,
  tx,
}: {
  jobId: UUID;
  kind: 'build' | 'rework';
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

  const result =
    kind === 'rework' ? buildReworkCfo({ buildSpec, catalogAssemblies }) : buildCfo({ buildSpec, catalogAssemblies });

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
