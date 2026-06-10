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
import {
  buildCfo,
  type CfoEntry,
  countWorkingDaysBetween,
  projectJobSlots,
  toJohannesburgDateKey,
  type WorkingCalendar,
} from '@pkg/domain';
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
import { and, asc, desc, eq, gt, gte, lt, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate, recordAuditEvent } from '../audit/audit-service.js';
import { documentBaseSelect } from '../documents/document-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { jobBayAuditDescriptor } from './job-bay-service.js';
import {
  JobBayNotFoundError,
  JobCreateFromQuoteDeniedError,
  JobNotFoundError,
  JobSlotBookingDeniedError,
  JobSlotNotFoundError,
} from './job-errors.js';
import type { JobRow } from './job-mappers.js';
import {
  createBayWorkingCalendar,
  createOrgWorkingCalendar,
  getJob,
  listBayCalendarExceptions,
  listWorkingCalendarOffDays,
} from './job-read-service.js';

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
    for (const seed of input.baySeeds) {
      await appendWorkJobSlotToBayQueue({
        bayId: seed.bayId,
        currentDate: effectiveCurrentDate,
        durationDays: seed.durationDays,
        jobId: job.id,
        tx,
      });
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

    const slot = await appendWorkJobSlotToBayQueue({
      bayId: input.bayId,
      currentDate: currentDate ?? new Date(),
      durationDays: input.durationDays,
      jobId: job.id,
      tx,
    });

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
    const [row] = await tx
      .select({
        bay: jobBays,
        slot: jobSlots,
      })
      .from(jobSlots)
      .innerJoin(jobBays, eq(jobSlots.bayId, jobBays.id))
      .where(eq(jobSlots.id, input.targetSlotId))
      .for('update');

    if (!row) {
      throw new JobSlotNotFoundError(input.targetSlotId);
    }

    const insertionSequence = input.placement === 'before' ? row.slot.sequence : row.slot.sequence + 1;
    const shiftCondition =
      input.placement === 'before'
        ? gte(jobSlots.sequence, row.slot.sequence)
        : gt(jobSlots.sequence, row.slot.sequence);

    await tx
      .update(jobSlots)
      .set({
        sequence: sql`${jobSlots.sequence} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(jobSlots.bayId, row.bay.id), shiftCondition));

    const slot = await insertIdleSlot({
      bayId: row.bay.id,
      durationDays: input.durationDays,
      label: input.label ?? null,
      sequence: insertionSequence,
      tx,
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

    const movingLeft = input.direction === 'left';
    const [adjacentSlot] = await tx
      .select()
      .from(jobSlots)
      .where(
        and(
          eq(jobSlots.bayId, row.bay.id),
          movingLeft
            ? lt(jobSlots.sequence, row.slot.sequence)
            : gt(jobSlots.sequence, row.slot.sequence),
        ),
      )
      .orderBy(movingLeft ? desc(jobSlots.sequence) : asc(jobSlots.sequence))
      .limit(1)
      .for('update');

    if (!adjacentSlot) {
      return MoveJobSlotResult.parse({ slot: row.slot });
    }

    const updatedAt = new Date();
    // The bay sequence unique index is deferrable, so this swap may pass through a temporary duplicate.
    const [slot] = await tx
      .update(jobSlots)
      .set({
        sequence: adjacentSlot.sequence,
        updatedAt,
      })
      .where(eq(jobSlots.id, row.slot.id))
      .returning();

    if (!slot) {
      throw new Error('Job slot move did not return a row');
    }

    const [swappedAdjacentSlot] = await tx
      .update(jobSlots)
      .set({
        sequence: row.slot.sequence,
        updatedAt,
      })
      .where(eq(jobSlots.id, adjacentSlot.id))
      .returning({ id: jobSlots.id });

    if (!swappedAdjacentSlot) {
      throw new Error('Adjacent job slot move did not return a row');
    }

    const beforeSlotOrder = movingLeft ? [adjacentSlot.id, row.slot.id] : [row.slot.id, adjacentSlot.id];
    const afterSlotOrder = movingLeft ? [row.slot.id, adjacentSlot.id] : [adjacentSlot.id, row.slot.id];
    await recordAuditEvent({
      action: 'updated',
      actorUserId,
      changes: {
        slotOrder: {
          from: beforeSlotOrder,
          to: afterSlotOrder,
        },
      },
      db: tx,
      descriptor: jobBayAuditDescriptor,
      entityId: row.bay.id,
      record: { name: row.bay.name },
    });

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

    const [slot] = await tx.delete(jobSlots).where(eq(jobSlots.id, row.slot.id)).returning();

    if (!slot) {
      throw new Error('Job slot delete did not return a row');
    }

    await tx
      .update(jobSlots)
      .set({
        sequence: sql`${jobSlots.sequence} - 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(jobSlots.bayId, row.bay.id), gt(jobSlots.sequence, row.slot.sequence)));

    return RemoveJobSlotResult.parse({ slot });
  });
}

async function getNextBaySlotSequence(tx: DatabaseTransaction, bayId: UUID): Promise<number> {
  const [sequenceRow] = await tx
    .select({
      sequence: sql<number>`coalesce(max(${jobSlots.sequence}), 0) + 1`,
    })
    .from(jobSlots)
    .where(eq(jobSlots.bayId, bayId));

  return Number(sequenceRow?.sequence ?? 1);
}

async function appendWorkJobSlotToBayQueue({
  bayId,
  currentDate,
  durationDays,
  jobId,
  tx,
}: {
  bayId: UUID;
  currentDate: Date;
  durationDays: number;
  jobId: UUID;
  tx: DatabaseTransaction;
}): Promise<typeof jobSlots.$inferSelect> {
  const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, bayId)).for('update');

  if (!bay) {
    throw new JobBayNotFoundError(bayId);
  }

  if (bay.disabledAt) {
    throw new JobSlotBookingDeniedError('This Bay is disabled and cannot accept new bookings.');
  }

  const workingCalendar = await getWorkingCalendar(tx, bay.id);
  let sequence = await getNextBaySlotSequence(tx, bay.id);
  const gapDays = await getIdleGapDaysBeforeAppend({
    bayId: bay.id,
    currentDate,
    scheduleOrigin: bay.scheduleOrigin,
    tx,
    workingCalendar,
  });

  if (gapDays > 0) {
    await insertIdleSlot({
      bayId: bay.id,
      durationDays: gapDays,
      label: null,
      sequence,
      tx,
    });
    sequence += 1;
  }

  const [slot] = await tx
    .insert(jobSlots)
    .values({
      bayId: bay.id,
      durationDays,
      jobId,
      kind: 'work',
      label: null,
      sequence,
    })
    .returning();

  if (!slot) {
    throw new Error('Job slot insert did not return a row');
  }

  return slot;
}

async function getWorkingCalendar(tx: DatabaseTransaction, bayId: UUID): Promise<WorkingCalendar> {
  return createBayWorkingCalendar(
    createOrgWorkingCalendar(await listWorkingCalendarOffDays(tx)),
    await listBayCalendarExceptions(tx, bayId),
  );
}

async function getIdleGapDaysBeforeAppend({
  bayId,
  currentDate,
  scheduleOrigin,
  tx,
  workingCalendar,
}: {
  bayId: UUID;
  currentDate: Date;
  scheduleOrigin: Date;
  tx: DatabaseTransaction;
  workingCalendar: WorkingCalendar;
}): Promise<number> {
  const existingSlots = await tx.query.jobSlots.findMany({
    orderBy: [asc(jobSlots.sequence), asc(jobSlots.id)],
    where: eq(jobSlots.bayId, bayId),
  });
  const projection = projectJobSlots({
    scheduleOrigin,
    slots: existingSlots,
    workingCalendar,
  });

  return countWorkingDaysBetween(projection.nextAvailableAt, currentDate, workingCalendar);
}

async function insertIdleSlot({
  bayId,
  durationDays,
  label,
  sequence,
  tx,
}: {
  bayId: UUID;
  durationDays: number;
  label: string | null;
  sequence: number;
  tx: DatabaseTransaction;
}) {
  const [slot] = await tx
    .insert(jobSlots)
    .values({
      bayId,
      durationDays,
      jobId: null,
      kind: 'idle',
      label,
      sequence,
    })
    .returning();

  if (!slot) {
    throw new Error('Idle job slot insert did not return a row');
  }

  return slot;
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
  return Number.parseInt(toJohannesburgDateKey(date).slice(2, 4), 10);
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
