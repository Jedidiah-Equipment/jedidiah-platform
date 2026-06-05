import {
  type DatabaseTransaction,
  type Db,
  documents,
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
} from '@pkg/db';
import { buildCfo, type CfoEntry, JOB_STAGE_PIPELINE } from '@pkg/domain';
import {
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
  type UserAccessSummary,
  type UUID,
} from '@pkg/schema';
import { asc, eq, sql } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate } from '../audit/audit-service.js';
import { documentBaseSelect } from '../documents/document-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import {
  JobBayNotFoundError,
  JobCreateFromQuoteDeniedError,
  JobSlotBookingDeniedError,
  JobStageNotFoundError,
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
  db,
  input,
}: {
  access: UserAccessSummary;
  db: Db;
  input: BookJobSlotInput;
}): Promise<BookJobSlotResult> {
  return db.transaction(async (tx) => {
    const [bay] = await tx.select().from(jobBays).where(eq(jobBays.id, input.bayId)).for('update');

    if (!bay) {
      throw new JobBayNotFoundError(input.bayId);
    }

    if (!canBookBaySchedule(access, bay.department)) {
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

    const [sequenceRow] = await tx
      .select({
        sequence: sql<number>`coalesce(max(${jobSlots.sequence}), 0) + 1`,
      })
      .from(jobSlots)
      .where(eq(jobSlots.bayId, bay.id));
    const sequence = Number(sequenceRow?.sequence ?? 1);

    const [slot] = await tx
      .insert(jobSlots)
      .values({
        bayId: bay.id,
        durationMinutes: input.durationMinutes,
        jobStageId: stage.id,
        sequence,
      })
      .returning();

    if (!slot) {
      throw new Error('Job slot insert did not return a row');
    }

    return BookJobSlotResult.parse({ slot });
  });
}

function canBookBaySchedule(access: UserAccessSummary, department: Department): boolean {
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
  const year = new Intl.DateTimeFormat('en-ZA', {
    timeZone: 'Africa/Johannesburg',
    year: '2-digit',
  }).format(date);

  return Number.parseInt(year, 10);
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
