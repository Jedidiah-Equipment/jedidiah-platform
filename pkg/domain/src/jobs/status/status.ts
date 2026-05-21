import type { JobLifecycleStatus, JobWorkState } from '@pkg/schema';

type ActualTimestamp = Date | string | null;

export type JobStatusDerivationInput = {
  actualEnd: ActualTimestamp;
  actualStart: ActualTimestamp;
  isCancelled: boolean;
  isPaused: boolean;
};

export type LevelStatusDerivationInput = {
  actualEnd: ActualTimestamp;
  actualStart: ActualTimestamp;
};

export type ActualWriteGuardInput = {
  isCancelled: boolean;
  isPaused: boolean;
};

export type ActualWriteGuardResult =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: string;
    };

export function deriveJobStatus(input: JobStatusDerivationInput): JobLifecycleStatus {
  if (input.isCancelled) return 'cancelled';
  if (input.isPaused) return 'paused';
  if (input.actualEnd) return 'complete';
  if (input.actualStart) return 'active';
  return 'not-started';
}

export function deriveLevelStatus(input: LevelStatusDerivationInput): JobWorkState {
  if (input.actualEnd) return 'complete';
  if (input.actualStart) return 'in-progress';
  return 'pending';
}

export function evaluateActualWriteGuard(input: ActualWriteGuardInput): ActualWriteGuardResult {
  if (input.isCancelled) {
    return deny('Job is cancelled.');
  }

  if (input.isPaused) {
    return deny('Job is paused.');
  }

  return { allowed: true, reason: null };
}

function deny(reason: string): ActualWriteGuardResult {
  return { allowed: false, reason };
}
