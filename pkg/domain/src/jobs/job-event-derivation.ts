import { DerivedStageJobEvent, type JobEventDerivationStage } from '@pkg/schema';

import type { StageTransition } from './stage-transition-policy.js';

export function deriveStageJobEvent({
  after,
  before,
  transition,
}: {
  after: JobEventDerivationStage;
  before: JobEventDerivationStage;
  transition: StageTransition;
}): DerivedStageJobEvent {
  if (transition === 'start') {
    if (!after.startedAt) {
      throw new Error('stage.started requires a startedAt value.');
    }

    return DerivedStageJobEvent.parse({
      eventType: 'stage.started',
      payload: {
        stage: after.stage,
        startedAt: after.startedAt,
        status: after.status,
      },
    });
  }

  if (transition === 'complete') {
    if (!after.completedAt) {
      throw new Error('stage.completed requires a completedAt value.');
    }

    return DerivedStageJobEvent.parse({
      eventType: 'stage.completed',
      payload: {
        completedAt: after.completedAt,
        stage: after.stage,
        status: after.status,
      },
    });
  }

  return DerivedStageJobEvent.parse({
    eventType: 'stage.status_changed',
    payload: {
      fromStatus: before.status,
      stage: after.stage,
      toStatus: after.status,
    },
  });
}
