import {
  type DatabaseTransaction,
  type Db,
  documents,
  jobBayCalendarExceptions,
  jobBays,
  jobCfoAssemblies,
  jobCfoParts,
  jobSlots,
  jobStages,
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
  hasPermission,
  JOB_STAGE_PIPELINE,
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
  type Department,
  formatJobCode,
  formatProductSerialNumber,
  JobCode,
  type JobCreateInput,
  type JobDetail,
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
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { and, asc, eq, gt, gte, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate } from '../audit/audit-service.js';
import { documentBaseSelect } from '../documents/document-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import {
  JobBayNotFoundError,
  JobCalendarEditDeniedError,
  JobCreateFromQuoteDeniedError,
  JobSlotBookingDeniedError,
  JobSlotIdleAddDeniedError,
  JobSlotNotFoundError,
  JobSlotRemoveDeniedError,
  JobSlotResizeDeniedError,
  JobStageNotFoundError,
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
  access,
  db,
  input,
  actorUserId,
  currentDate,
}: {
  access: UserAccessSummary;
  db: Db;
  input: JobCreateInput;
  actorUserId: AuthId;
  currentDate?: Date;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const quote = await validateJobQuoteForCreate({ quoteId: input.quoteId, tx });
    const cfo = await buildJobCfoForQuote({ productId: quote.productId, quoteId: quote.id, tx });
    const productSerial = await createProductSerial({
      productId: quote.productId,
      tx,
      currentDate: currentDate ?? new Date(),
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

    const stageRows = await tx
      .insert(jobStages)
      .values(buildJobStageInsertValues({ jobId: job.id }))
      .returning();
    if (stageRows.length !== JOB_STAGE_PIPELINE.length) {
      throw new Error('Job stage insert did not return every row');
    }

    await recordAuditCreate({ db: tx, descriptor: jobAuditDescriptor, actorUserId, input: job });

    return getJob({ access, db: tx, id: job.id });
  });
}

export async function bookJobSlot({
  access,
  currentDate,
  db,
  input,
}: {
  access: UserAccessSummary;
  currentDate?: Date;
  db: Db;
  input: BookJobSlotInput;
}): Promise<BookJobSlotResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    if (!canEditBaySchedule(access, bay.department)) {
      throw new JobSlotBookingDeniedError('You do not have permission to book this Bay.');
    }

    const [stage] = await tx
      .select({
        id: jobStages.id,
        jobId: jobStages.jobId,
        stage: jobStages.stage,
      })
      .from(jobStages)
      .where(eq(jobStages.id, input.jobStageId));

    if (!stage) {
      throw new JobStageNotFoundError(input.jobStageId);
    }

    if (stage.stage !== bay.department) {
      throw new JobSlotBookingDeniedError('Bay department must match the Job stage department.');
    }

    const workingCalendar = createBayWorkingCalendar(
      createOrgWorkingCalendar(await listWorkingCalendarOffDays(tx)),
      await listBayCalendarExceptions(tx, bay.id),
    );
    let sequence = await getNextBaySlotSequence(tx, bay.id);
    const gapDays = await getIdleGapDaysBeforeAppend({
      bayId: bay.id,
      currentDate: currentDate ?? new Date(),
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
        durationDays: input.durationDays,
        jobStageId: stage.id,
        kind: 'work',
        label: null,
        sequence,
      })
      .returning();

    if (!slot) {
      throw new Error('Job slot insert did not return a row');
    }

    return BookJobSlotResult.parse({ slot });
  });
}

export async function toggleOffDay({
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
  db: Db;
  input: ToggleOffDayInput;
}): Promise<ToggleOffDayResult> {
  if (!hasPermission(access, 'job:update-calendar')) {
    throw new JobCalendarEditDeniedError('You do not have permission to manage the Job calendar.');
  }

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
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
  db: Db;
  input: AddBayCalendarExceptionInput;
}): Promise<AddBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    if (!canEditBaySchedule(access, bay.department)) {
      throw new JobCalendarEditDeniedError('You do not have permission to manage this Bay calendar.');
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
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
  db: Db;
  input: RemoveBayCalendarExceptionInput;
}): Promise<RemoveBayCalendarExceptionResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    if (!canEditBaySchedule(access, bay.department)) {
      throw new JobCalendarEditDeniedError('You do not have permission to manage this Bay calendar.');
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
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
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

    if (!canEditBaySchedule(access, row.bay.department)) {
      throw new JobSlotIdleAddDeniedError('You do not have permission to add idle time to this Bay schedule.');
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
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
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

    if (!canEditBaySchedule(access, row.bay.department)) {
      throw new JobSlotResizeDeniedError('You do not have permission to resize this Bay schedule.');
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

export async function removeJobSlot({
  access,
  db,
  input,
}: {
  access: UserAccessSummary;
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

    if (!canEditBaySchedule(access, row.bay.department)) {
      throw new JobSlotRemoveDeniedError('You do not have permission to remove from this Bay schedule.');
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
      jobStageId: null,
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

function canEditBaySchedule(access: UserAccessSummary, department: Department): boolean {
  if (access.role === 'admin' || access.role === 'job-supervisor') {
    return true;
  }

  if (access.role !== 'job-department-manager') {
    return false;
  }

  return access.departments.length === 0 || access.departments.includes(department);
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

function buildJobStageInsertValues({ jobId }: { jobId: UUID }) {
  return JOB_STAGE_PIPELINE.map(({ sequence, stage }) => {
    return {
      jobId,
      sequence,
      stage,
    };
  });
}
