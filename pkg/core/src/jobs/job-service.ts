import {
  type DatabaseTransaction,
  type Db,
  documents,
  jobBayCalendarExceptions,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobs,
  productSerialSequences,
  products,
  quoteSelectedAssemblies,
  quotes,
  workingCalendarOffDays,
} from '@pkg/db';
import { buildCfo, type CfoEntry, toPlantDateOnly } from '@pkg/domain';
import {
  type AddBayCalendarExceptionInput,
  AddBayCalendarExceptionResult,
  type AddIdleJobSlotInput,
  AddIdleJobSlotResult,
  type AuthId,
  type BookJobSlotInput,
  BookJobSlotResult,
  formatJobCode,
  formatProductSerialNumber,
  JobCode,
  type JobCreateInput,
  type JobDetail,
  type MoveJobSlotInput,
  MoveJobSlotResult,
  ProductSerialPrefix,
  ProductSerialSequence,
  ProductSerialYear,
  type RemoveBayCalendarExceptionInput,
  RemoveBayCalendarExceptionResult,
  type RemoveJobSlotInput,
  RemoveJobSlotResult,
  type ResizeJobSlotInput,
  ResizeJobSlotResult,
  type ToggleOffDayInput,
  ToggleOffDayResult,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate, recordAuditEvent } from '../audit/audit-service.js';
import { documentBaseSelect } from '../documents/document-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { lockBayQueue, lockBayQueueBySlot } from './bay-queue.js';
import { jobBayAuditDescriptor } from './job-bay-service.js';
import {
  JobBayNotFoundError,
  JobCreateFromQuoteDeniedError,
  JobNotFoundError,
  JobSlotNotFoundError,
} from './job-errors.js';
import type { JobRow } from './job-mappers.js';
import { getJob } from './job-read-service.js';

export const jobAuditDescriptor = defineAuditDescriptor<JobRow>({
  entityType: 'job',
  noun: 'job',
  primaryLabelField: 'code',
  primaryLabelFormatter: formatJobAuditLabel,
  entityId: (row) => row.id,
  label: (row) => row.code,
  toRecord: (row) => ({
    productId: row.productId,
    productSerialNumber: row.productSerialNumber,
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
  db,
  input,
  actorUserId,
  currentDate,
}: {
  db: Db;
  input: JobCreateInput;
  actorUserId: AuthId;
  currentDate?: Date;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const quote = await validateJobQuoteForCreate({ quoteId: input.quoteId, tx });
    const cfo = await buildJobCfoForQuote({ productId: quote.productId, quoteId: quote.id, tx });
    const effectiveCurrentDate = currentDate ?? new Date();
    const productSerial = await createProductSerial({
      productId: quote.productId,
      tx,
      currentDate: effectiveCurrentDate,
    });

    const [job] = await tx
      .insert(jobs)
      .values({
        productId: quote.productId,
        productSerialNumber: productSerial.number,
        productSerialPrefix: productSerial.prefix,
        productSerialSequence: productSerial.sequence,
        productSerialYear: productSerial.year,
        quoteId: quote.id,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    await insertJobCfo({ cfo, jobId: job.id, tx });
    await snapshotJobDocuments({
      jobId: job.id,
      productId: quote.productId,
      tx,
    });
    const plantToday = toPlantDateOnly(effectiveCurrentDate);
    for (const seed of input.baySeeds) {
      const queue = await lockBayQueue(tx, seed.bayId);
      await queue.append({ durationDays: seed.durationDays, jobId: job.id, kind: 'work' }, { currentDate: plantToday });
    }

    await recordAuditCreate({ db: tx, descriptor: jobAuditDescriptor, actorUserId, input: job });

    return getJob({ db: tx, id: job.id });
  });
}

export async function bookJobSlot({
  currentDate,
  db,
  input,
}: {
  currentDate?: Date;
  db: Db;
  input: BookJobSlotInput;
}): Promise<BookJobSlotResult> {
  return db.transaction(async (tx) => {
    const [job] = await tx
      .select({
        id: jobs.id,
      })
      .from(jobs)
      .where(eq(jobs.id, input.jobId));

    if (!job) {
      throw new JobNotFoundError(input.jobId);
    }

    const queue = await lockBayQueue(tx, input.bayId);
    const spec = { durationDays: input.durationDays, jobId: job.id, kind: 'work' } as const;
    const plantToday = toPlantDateOnly(currentDate ?? new Date());
    const slot = input.startDate
      ? await queue.insertAtDate(spec, {
          currentDate: plantToday,
          startDate: input.startDate,
        })
      : await queue.append(spec, { currentDate: plantToday });

    return BookJobSlotResult.parse({ slot });
  });
}

export async function toggleOffDay({ db, input }: { db: Db; input: ToggleOffDayInput }): Promise<ToggleOffDayResult> {
  return db.transaction(async (tx) => {
    if (!input.isOffDay) {
      await tx.delete(workingCalendarOffDays).where(eq(workingCalendarOffDays.date, input.date));

      return ToggleOffDayResult.parse({ offDay: null });
    }

    const [row] = await tx
      .insert(workingCalendarOffDays)
      .values({
        date: input.date,
        label: input.label,
      })
      .onConflictDoUpdate({
        target: workingCalendarOffDays.date,
        set: {
          label: input.label,
          updatedAt: new Date(),
        },
      })
      .returning({
        date: workingCalendarOffDays.date,
        label: workingCalendarOffDays.label,
      });

    if (!row) {
      throw new Error('Off-Day upsert did not return a row');
    }

    return ToggleOffDayResult.parse({ offDay: row });
  });
}

export async function addBayCalendarException({
  db,
  input,
}: {
  db: Db;
  input: AddBayCalendarExceptionInput;
}): Promise<AddBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    const [row] = await tx
      .insert(jobBayCalendarExceptions)
      .values({
        bayId: bay.id,
        date: input.date,
        direction: input.direction,
        label: input.label,
      })
      .onConflictDoUpdate({
        target: [jobBayCalendarExceptions.bayId, jobBayCalendarExceptions.date],
        set: {
          direction: input.direction,
          label: input.label,
          updatedAt: new Date(),
        },
      })
      .returning({
        bayId: jobBayCalendarExceptions.bayId,
        date: jobBayCalendarExceptions.date,
        direction: jobBayCalendarExceptions.direction,
        label: jobBayCalendarExceptions.label,
      });

    if (!row) {
      throw new Error('Bay calendar exception upsert did not return a row');
    }

    return AddBayCalendarExceptionResult.parse({ exception: row });
  });
}

export async function removeBayCalendarException({
  db,
  input,
}: {
  db: Db;
  input: RemoveBayCalendarExceptionInput;
}): Promise<RemoveBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    const [row] = await tx
      .delete(jobBayCalendarExceptions)
      .where(and(eq(jobBayCalendarExceptions.bayId, bay.id), eq(jobBayCalendarExceptions.date, input.date)))
      .returning({
        bayId: jobBayCalendarExceptions.bayId,
        date: jobBayCalendarExceptions.date,
        direction: jobBayCalendarExceptions.direction,
        label: jobBayCalendarExceptions.label,
      });

    return RemoveBayCalendarExceptionResult.parse({ exception: row ?? null });
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
    const queue = await lockBayQueueBySlot(tx, input.targetSlotId);
    const slot = await queue.insertRelative(input.targetSlotId, input.placement, {
      durationDays: input.durationDays,
      kind: 'idle',
      label: input.label ?? null,
    });

    return AddIdleJobSlotResult.parse({ slot });
  });
}

export async function resizeJobSlot({
  db,
  input,
}: {
  db: Db;
  input: ResizeJobSlotInput;
}): Promise<ResizeJobSlotResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        bay: jobBays,
        slot: jobSlots,
      })
      .from(jobSlots)
      .innerJoin(jobBays, eq(jobSlots.bayId, jobBays.id))
      .where(eq(jobSlots.id, input.slotId))
      .for('update');

    if (!row) {
      throw new JobSlotNotFoundError(input.slotId);
    }

    const [slot] = await tx
      .update(jobSlots)
      .set({
        durationDays: input.durationDays,
        updatedAt: new Date(),
      })
      .where(eq(jobSlots.id, row.slot.id))
      .returning();

    if (!slot) {
      throw new Error('Job slot update did not return a row');
    }

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
  currentDate,
}: {
  productId: UUID;
  tx: DatabaseTransaction;
  currentDate: Date;
}) {
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
      updatedAt: currentDate,
    })
    .onConflictDoUpdate({
      target: productSerialSequences.productId,
      set: {
        lastSequence: sql`${productSerialSequences.lastSequence} + 1`,
        updatedAt: currentDate,
      },
    })
    .returning({
      lastSequence: productSerialSequences.lastSequence,
    });

  if (!sequenceRow) {
    throw new Error('Product serial sequence upsert did not return a row');
  }

  const prefix = ProductSerialPrefix.parse(product.modelCode);
  const year = ProductSerialYear.parse(getJohannesburgTwoDigitYear(currentDate));
  const sequence = ProductSerialSequence.parse(sequenceRow.lastSequence);

  return {
    number: formatProductSerialNumber({ prefix, sequence, year }),
    prefix,
    sequence,
    year,
  };
}

function getJohannesburgTwoDigitYear(date: Date): number {
  return Number.parseInt(toPlantDateOnly(date).slice(2, 4), 10);
}

async function validateJobQuoteForCreate({
  quoteId,
  tx,
}: {
  quoteId: UUID;
  tx: DatabaseTransaction;
}): Promise<typeof quotes.$inferSelect> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  if (quote.status !== 'accepted') {
    throw new JobCreateFromQuoteDeniedError('Only accepted quotes can start a Job.');
  }

  const [existingJob] = await tx
    .select({
      id: jobs.id,
    })
    .from(jobs)
    .where(eq(jobs.quoteId, quoteId))
    .limit(1);

  if (existingJob) {
    throw new JobCreateFromQuoteDeniedError('Quote already has a Job.');
  }

  return quote;
}

async function buildJobCfoForQuote({
  productId,
  quoteId,
  tx,
}: {
  productId: UUID;
  quoteId: UUID;
  tx: DatabaseTransaction;
}) {
  const [catalogAssemblies, selectedRows] = await Promise.all([
    listAssemblies({ productId, tx }),
    tx
      .select({
        assemblyName: quoteSelectedAssemblies.quotedName,
        productAssemblyId: quoteSelectedAssemblies.productAssemblyId,
      })
      .from(quoteSelectedAssemblies)
      .where(eq(quoteSelectedAssemblies.quoteId, quoteId))
      .orderBy(asc(quoteSelectedAssemblies.createdAt), asc(quoteSelectedAssemblies.id)),
  ]);

  const result = buildCfo({
    catalogAssemblies,
    selectedAssemblies: selectedRows,
  });

  if (!result.ok) {
    throw new JobCreateFromQuoteDeniedError(
      `Selected optional assembly is stale: ${result.staleAssemblyNames.join(', ')}.`,
    );
  }

  return result.cfo;
}

async function insertJobCfo({
  cfo,
  jobId,
  tx,
}: {
  cfo: Awaited<ReturnType<typeof buildJobCfoForQuote>>;
  jobId: UUID;
  tx: DatabaseTransaction;
}): Promise<void> {
  // Freeze the build order: standards in catalog display order, then selected optionals in the
  // order resolveEffectiveBom produces. Densely sequenced per kind so the CFO read reproduces it.
  const sequenceByKind: Record<CfoEntry['kind'], number> = { optional: 0, standard: 0 };

  for (const assembly of cfo) {
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

export async function snapshotJobDocuments({
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
