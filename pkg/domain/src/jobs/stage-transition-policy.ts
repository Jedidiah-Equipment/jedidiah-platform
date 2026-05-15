import type { JobLifecycleStatus, JobStageName, UserAccessSummary } from '@pkg/schema';

import { canEditStage } from '../auth/authorization.js';

export const STAGE_TRANSITIONS = ['start', 'set-status', 'complete'] as const;

export type StageTransition = (typeof STAGE_TRANSITIONS)[number];

export type StageTransitionPolicyStage = {
  completedAt: unknown | null;
  sequence: number;
  stage: JobStageName;
  startedAt: unknown | null;
};

export type StageTransitionPolicyJob = {
  lifecycleStatus: JobLifecycleStatus;
};

export type StageTransitionPolicyInput = {
  access: UserAccessSummary | null | undefined;
  job: StageTransitionPolicyJob;
  previousStage: Pick<StageTransitionPolicyStage, 'completedAt'> | null;
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
  if (input.job.lifecycleStatus !== 'active') {
    return deny('Job is not active.');
  }

  if (!canEditStage(input.access, input.stage)) {
    return deny('You do not have access to update this stage.');
  }

  if (input.transition === 'start') {
    return evaluateStartTransition(input);
  }

  if (input.transition === 'complete') {
    return evaluateCompleteTransition(input);
  }

  return allow();
}

export function getStageTransitionAvailability(
  input: Omit<StageTransitionPolicyInput, 'transition'>,
): StageTransitionAvailability {
  return {
    complete: evaluateStageTransition({ ...input, transition: 'complete' }),
    'set-status': evaluateStageTransition({ ...input, transition: 'set-status' }),
    start: evaluateStageTransition({ ...input, transition: 'start' }),
  };
}

function evaluateStartTransition(input: StageTransitionPolicyInput): StageTransitionPolicyResult {
  if (input.stage.startedAt) {
    return deny('Stage has already started.');
  }

  if (input.previousStage && !input.previousStage.completedAt) {
    return deny('Previous stage is not complete.');
  }

  return allow();
}

function evaluateCompleteTransition(input: StageTransitionPolicyInput): StageTransitionPolicyResult {
  if (!input.stage.startedAt) {
    return deny('Stage has not started.');
  }

  if (input.stage.completedAt) {
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
