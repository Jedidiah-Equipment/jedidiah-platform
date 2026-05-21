import type { JobStageName, UserAccessSummary } from '@pkg/schema';

import { canEditStage } from '../auth/authorization.js';
import { evaluateActualWriteGuard } from './status/index.js';

export const STAGE_TRANSITIONS = ['start', 'stop'] as const;

export type StageTransition = (typeof STAGE_TRANSITIONS)[number];

export type StageTransitionPolicyStage = {
  actualEnd: unknown | null;
  actualStart: unknown | null;
  sequence: number;
  stage: JobStageName;
};

export type StageTransitionPolicyJob = {
  isCancelled: boolean;
  isPaused: boolean;
};

export type StageTransitionPolicyInput = {
  access: UserAccessSummary | null | undefined;
  job: StageTransitionPolicyJob;
  previousStage: Pick<StageTransitionPolicyStage, 'actualEnd'> | null;
  stage: StageTransitionPolicyStage;
  transition: StageTransition;
};

export type StageTransitionPolicyResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export type StageTransitionAvailability = Record<StageTransition, StageTransitionPolicyResult>;

export function evaluateStageTransition(input: StageTransitionPolicyInput): StageTransitionPolicyResult {
  const actualWriteGuard = evaluateActualWriteGuard(input.job);
  if (!actualWriteGuard.allowed) {
    return actualWriteGuard;
  }

  if (!canEditStage(input.access, input.stage)) {
    return deny('You do not have access to update this stage.');
  }

  if (input.transition === 'start') {
    return evaluateStartTransition(input);
  }

  return evaluateStopTransition(input);
}

export function getStageTransitionAvailability(
  input: Omit<StageTransitionPolicyInput, 'transition'>,
): StageTransitionAvailability {
  return {
    start: evaluateStageTransition({ ...input, transition: 'start' }),
    stop: evaluateStageTransition({ ...input, transition: 'stop' }),
  };
}

function evaluateStartTransition(input: StageTransitionPolicyInput): StageTransitionPolicyResult {
  if (input.stage.actualStart) {
    return deny('Stage has already started.');
  }

  if (input.previousStage && !input.previousStage.actualEnd) {
    return deny('Previous stage is not complete.');
  }

  return allow();
}

function evaluateStopTransition(input: StageTransitionPolicyInput): StageTransitionPolicyResult {
  if (!input.stage.actualStart) {
    return deny('Stage has not started.');
  }

  if (input.stage.actualEnd) {
    return deny('Stage is already complete.');
  }

  return allow();
}

function allow(): StageTransitionPolicyResult {
  return { allowed: true, reason: null };
}

function deny(reason: string): StageTransitionPolicyResult {
  return { allowed: false, reason };
}
