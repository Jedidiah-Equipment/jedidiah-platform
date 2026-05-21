import { DerivedStageJobEvent, type JobEventDerivationStage } from '@pkg/schema';

import type { StageTransition } from './stage-transition-policy.js';

export function deriveStageJobEvent({
  after,
  transition,
}: {
  after: JobEventDerivationStage;
  before: JobEventDerivationStage;
  transition: StageTransition;
}): DerivedStageJobEvent {
  if (transition === 'start') {
    if (!after.actualStart) {
      throw new Error('stage.started requires an actualStart value.');
    }

    return DerivedStageJobEvent.parse({
      eventType: 'stage.started',
      payload: {
        actualStart: after.actualStart,
        stage: after.stage,
      },
    });
  }

  if (!after.actualEnd) {
    throw new Error('stage.stopped requires an actualEnd value.');
  }

  return DerivedStageJobEvent.parse({
    eventType: 'stage.stopped',
    payload: {
      actualEnd: after.actualEnd,
      stage: after.stage,
    },
  });
}
