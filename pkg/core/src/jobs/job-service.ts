import { type DatabaseTransaction, type Db, jobStages, jobs, quotes } from '@pkg/db';
import { JOB_STAGE_PIPELINE } from '@pkg/domain';
import type { AuthId, JobCreateInput, JobDetail, UserAccessSummary, UUID } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { insertAuditEvent, jobAuditDescriptor } from '../audit/audit-service.js';
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
    const quoteId = input.quoteId ?? null;

    if (quoteId) {
      await validateJobQuoteForCreate({ quoteId, tx });
    }

    const [job] = await tx
      .insert(jobs)
      .values({
        productId: input.productId,
        quoteId,
      })
      .returning();

    if (!job) {
      throw new Error('Job insert did not return a row');
    }

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

async function validateJobQuoteForCreate({ quoteId, tx }: { quoteId: UUID; tx: DatabaseTransaction }): Promise<void> {
  const [quote] = await tx.select().from(quotes).where(eq(quotes.id, quoteId)).for('update');

  if (!quote) {
    throw new JobCreateFromQuoteDeniedError('Quote not found.');
  }

  return;
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
