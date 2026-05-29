import {
  type DatabaseTransaction,
  type Db,
  jobCfoAssemblies,
  jobCfoParts,
  jobStages,
  jobs,
  quoteSelectedAssemblies,
  quotes,
} from '@pkg/db';
import { buildCfo, JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { AuthId, JobCreateInput, JobDetail, UserAccessSummary, UUID } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
import { listAssemblies } from '../products/product-assembly-service.js';
import { JobCreateFromQuoteDeniedError } from './job-errors.js';
import { mapJobAuditRecord } from './job-mappers.js';
import { getJob } from './job-read-service.js';

export async function createJob({
  access,
  db,
  input,
  actorUserId,
}: {
  access: UserAccessSummary;
  db: Db;
  input: JobCreateInput;
  actorUserId: AuthId;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const quote = await validateJobQuoteForCreate({ quoteId: input.quoteId, tx });
    const cfo = await buildJobCfoForQuote({ productId: quote.productId, quoteId: quote.id, tx });

    const [job] = await tx
      .insert(jobs)
      .values({
        productId: quote.productId,
        quoteId: quote.id,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

    await insertJobCfo({ cfo, jobId: job.id, tx });

    const stageRows = await tx
      .insert(jobStages)
      .values(buildJobStageInsertValues({ jobId: job.id }))
      .returning();
    if (stageRows.length !== JOB_STAGE_PIPELINE.length) {
      throw new Error('Job stage insert did not return every row');
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'created',
        actorUserId,
        after: mapJobAuditRecord(job),
        before: null,
        changes: null,
        entityId: job.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });

    return getJob({ access, db: tx, id: job.id });
  });
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
  for (const assembly of cfo) {
    const [cfoAssembly] = await tx
      .insert(jobCfoAssemblies)
      .values({
        assemblyName: assembly.assemblyName,
        jobId,
        kind: assembly.kind,
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

function buildJobStageInsertValues({ jobId }: { jobId: UUID }) {
  return JOB_STAGE_PIPELINE.map(({ sequence, stage }) => {
    return {
      jobId,
      sequence,
      stage,
    };
  });
}
