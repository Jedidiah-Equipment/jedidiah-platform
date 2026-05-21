import { type DatabaseTransaction, type Db, jobEvents, jobStages, jobs } from '@pkg/db';
import { deriveStageJobEvent, evaluateStageTransition, type StageTransition } from '@pkg/domain';
import type { AuthId, JobDetail, JobStageName, UserAccessSummary, UUID } from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';

import {
  createAuditChanges,
  insertAuditEvent,
  jobAuditDescriptor,
  jobStageAuditDescriptor,
} from '../audit/audit-service.js';
import { JobNotFoundError, JobStageTransitionDeniedError } from './job-errors.js';
import { completeJobLifecycle } from './job-lifecycle-service.js';
import {
  type JobAuditRecord,
  type JobStageRow,
  mapJobAuditRecord,
  mapJobEventDerivationStage,
  mapJobStage,
} from './job-mappers.js';
import { getJob } from './job-read-service.js';

type JobPipelineTransition =
  | {
      transition: 'start';
    }
  | {
      transition: 'complete';
    };

type StageTransitionTarget = {
  job: JobAuditRecord;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
};

type EffectiveStageIntent = {
  transition: StageTransition;
  values: Partial<Pick<JobStageRow, 'actualEnd' | 'actualStart'>>;
};

export async function applyJobStageTransition({
  db,
  access,
  actorUserId,
  id,
  stage,
  intent,
}: {
  db: Db;
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
  intent: JobPipelineTransition;
}): Promise<JobDetail> {
  return db.transaction(async (tx) => {
    const transitionTarget = await readStageTransitionTarget({ db: tx, id, stage });
    const effectiveIntent = resolveEffectiveIntent(intent);

    assertStageTransitionAllowed({
      access,
      transition: effectiveIntent.transition,
      transitionTarget,
    });

    return writeJobStageTransition({
      access,
      actorUserId,
      id,
      stage,
      transition: effectiveIntent.transition,
      transitionTarget,
      tx,
      values: effectiveIntent.values,
    });
  });
}

function resolveEffectiveIntent(intent: JobPipelineTransition): EffectiveStageIntent {
  if (intent.transition === 'start') {
    return {
      transition: 'start',
      values: {
        actualStart: new Date(),
      },
    };
  }

  if (intent.transition === 'complete') {
    return {
      transition: 'stop',
      values: {
        actualEnd: new Date(),
      },
    };
  }

  const exhaustive: never = intent;
  throw new Error(`Unsupported job stage transition: ${JSON.stringify(exhaustive)}`);
}

function assertStageTransitionAllowed({
  access,
  transition,
  transitionTarget,
}: {
  access: UserAccessSummary;
  transition: StageTransition;
  transitionTarget: StageTransitionTarget;
}): void {
  const result = evaluateStageTransition({
    access,
    job: transitionTarget.job,
    previousStage: transitionTarget.previousStage,
    stage: transitionTarget.stage,
    transition,
  });

  if (!result.allowed) {
    throw new JobStageTransitionDeniedError(result.reason);
  }
}

async function writeJobStageTransition({
  access,
  actorUserId,
  id,
  stage,
  transition,
  transitionTarget,
  tx,
  values,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  id: UUID;
  stage: JobStageName;
  transition: StageTransition;
  transitionTarget: StageTransitionTarget;
  tx: DatabaseTransaction;
  values: Partial<Pick<JobStageRow, 'actualEnd' | 'actualStart'>>;
}): Promise<JobDetail> {
  const [updatedStage] = await tx
    .update(jobStages)
    .set(values)
    .where(and(eq(jobStages.jobId, id), eq(jobStages.stage, stage)))
    .returning();

  if (!updatedStage) {
    throw new JobNotFoundError(id);
  }

  const beforeStage = mapJobStage(transitionTarget.stage);
  const afterStage = mapJobStage(updatedStage);
  const jobActualStart = transition === 'start' && !transitionTarget.job.actualStart ? values.actualStart : null;

  if (jobActualStart) {
    const [updatedJob] = await tx
      .update(jobs)
      .set({ actualStart: jobActualStart, updatedAt: new Date() })
      .where(eq(jobs.id, id))
      .returning();

    if (!updatedJob) {
      throw new JobNotFoundError(id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'updated',
        actorUserId,
        after: mapJobAuditRecord(updatedJob),
        before: transitionTarget.job,
        changes: createAuditChanges(transitionTarget.job, mapJobAuditRecord(updatedJob), {
          actualStart: jobAuditDescriptor.fields.actualStart ?? 'actual start',
        }),
        entityId: updatedJob.id,
        entityType: jobAuditDescriptor.entityType,
      },
    });
  }

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after: afterStage,
      before: beforeStage,
      changes: createAuditChanges(beforeStage, afterStage, {
        actualEnd: 'actual end',
        actualStart: 'actual start',
      }),
      entityId: updatedStage.id,
      entityType: jobStageAuditDescriptor.entityType,
    },
  });

  const jobEvent = deriveStageJobEvent({
    after: mapJobEventDerivationStage(updatedStage),
    before: mapJobEventDerivationStage(transitionTarget.stage),
    transition,
  });

  await tx.insert(jobEvents).values({
    actorUserId,
    eventType: jobEvent.eventType,
    jobId: id,
    occurredAt: new Date(),
    payload: jobEvent.payload,
    stageId: updatedStage.id,
  });

  if (transition === 'stop' && updatedStage.stage === 'assembly') {
    await completeJobLifecycle({
      actorUserId,
      before: transitionTarget.job,
      id,
      tx,
    });
  }

  return getJob({ access, db: tx, id });
}

async function readStageTransitionTarget({
  db,
  id,
  stage,
}: {
  db: DatabaseTransaction;
  id: UUID;
  stage: JobStageName;
}): Promise<StageTransitionTarget> {
  const rows = await db
    .select({
      job: jobs,
      stage: jobStages,
    })
    .from(jobs)
    .innerJoin(jobStages, eq(jobStages.jobId, jobs.id))
    .where(eq(jobs.id, id))
    .orderBy(asc(jobStages.sequence))
    .for('update');

  const currentStageIndex = rows.findIndex((row) => row.stage.stage === stage);
  const currentRow = rows[currentStageIndex];
  const currentStage = currentRow?.stage;

  if (!currentStage) {
    throw new JobNotFoundError(id);
  }

  return {
    job: mapJobAuditRecord(currentRow.job),
    previousStage: currentStageIndex > 0 ? (rows[currentStageIndex - 1]?.stage ?? null) : null,
    stage: currentStage,
  };
}
