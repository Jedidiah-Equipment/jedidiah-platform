import { type DatabaseTransaction, type Db, jobEvents, jobStages, jobs } from '@pkg/db';
import { deriveStageJobEvent, evaluateStageTransition, type StageTransition } from '@pkg/domain';
import type { AuthId, JobDetail, JobStageName, JobStageStatusInput, UserAccessSummary, UUID } from '@pkg/schema';
import { and, asc, eq } from 'drizzle-orm';

import { createAuditChanges, insertAuditEvent, jobStageAuditDescriptor } from '../audit/audit-service.js';
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
      status: JobStageStatusInput['status'];
      transition: 'set-status';
    }
  | {
      transition: 'complete';
    };

type StageTransitionTarget = {
  job: JobAuditRecord;
  previousStage: JobStageRow | null;
  stage: JobStageRow;
};

type StageTransitionPolicyOverride = {
  completedAt: Date | null;
  transition: StageTransition;
};

type EffectiveStageIntent =
  | {
      kind: 'apply';
      policyOverride?: StageTransitionPolicyOverride;
      transition: StageTransition;
      values: Partial<Pick<JobStageRow, 'completedAt' | 'startedAt' | 'status'>>;
    }
  | {
      kind: 'noop';
      policyOverride: StageTransitionPolicyOverride;
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
    const effectiveIntent = resolveEffectiveIntent({ intent, transitionTarget });
    const policyTransition =
      effectiveIntent.kind === 'noop'
        ? effectiveIntent.policyOverride.transition
        : (effectiveIntent.policyOverride?.transition ?? effectiveIntent.transition);

    assertStageTransitionAllowed({
      access,
      transition: policyTransition,
      transitionTarget,
      ...(effectiveIntent.policyOverride ? { policyOverride: effectiveIntent.policyOverride } : {}),
    });

    if (effectiveIntent.kind === 'noop') {
      return getJob({ access, db: tx, id });
    }

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

function resolveEffectiveIntent({
  intent,
  transitionTarget,
}: {
  intent: JobPipelineTransition;
  transitionTarget: StageTransitionTarget;
}): EffectiveStageIntent {
  if (intent.transition === 'start') {
    return {
      kind: 'apply',
      transition: 'start',
      values: {
        startedAt: new Date(),
      },
    };
  }

  if (intent.transition === 'complete') {
    return {
      kind: 'apply',
      transition: 'complete',
      values: {
        completedAt: new Date(),
        status: 'complete',
      },
    };
  }

  if (intent.status !== 'complete') {
    return {
      kind: 'apply',
      transition: 'set-status',
      values: {
        status: intent.status,
      },
    };
  }

  if (transitionTarget.stage.completedAt) {
    const completedStatusRelockPolicy = createCompletedStatusRelockPolicy();

    if (transitionTarget.stage.status === 'complete') {
      return {
        kind: 'noop',
        policyOverride: completedStatusRelockPolicy,
      };
    }

    return {
      kind: 'apply',
      policyOverride: completedStatusRelockPolicy,
      transition: 'set-status',
      values: {
        status: 'complete',
      },
    };
  }

  return {
    kind: 'apply',
    transition: 'complete',
    values: {
      completedAt: new Date(),
      status: 'complete',
    },
  };
}

function createCompletedStatusRelockPolicy(): StageTransitionPolicyOverride {
  return {
    // The stage is already historically complete but status drifted; evaluate access/order as a completion attempt.
    completedAt: null,
    transition: 'complete',
  };
}

function assertStageTransitionAllowed({
  access,
  policyOverride,
  transition,
  transitionTarget,
}: {
  access: UserAccessSummary;
  policyOverride?: StageTransitionPolicyOverride;
  transition: StageTransition;
  transitionTarget: StageTransitionTarget;
}): void {
  const result = evaluateStageTransition({
    access,
    job: transitionTarget.job,
    previousStage: transitionTarget.previousStage,
    stage: policyOverride
      ? {
          ...transitionTarget.stage,
          completedAt: policyOverride.completedAt,
        }
      : transitionTarget.stage,
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
  values: Partial<Pick<JobStageRow, 'completedAt' | 'startedAt' | 'status'>>;
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

  await insertAuditEvent({
    db: tx,
    input: {
      action: 'updated',
      actorUserId,
      after: afterStage,
      before: beforeStage,
      changes: createAuditChanges(beforeStage, afterStage, {
        completedAt: 'completed at',
        startedAt: 'started at',
        status: 'status',
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

  if (transition === 'complete' && updatedStage.stage === 'dispatch') {
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
