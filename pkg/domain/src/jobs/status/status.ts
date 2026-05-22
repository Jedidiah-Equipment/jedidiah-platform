import type { JobStatus, JobWorkState } from '@pkg/schema';

type ActualTimestamp = Date | string | null;

export type LevelStatusDerivationInput = {
  actualEnd: ActualTimestamp;
  actualStart: ActualTimestamp;
};

export type ActualWriteGuardInput = {
  status: JobStatus;
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

export function deriveLevelStatus(input: LevelStatusDerivationInput): JobWorkState {
  if (input.actualEnd) return 'complete';
  if (input.actualStart) return 'in-progress';
  return 'pending';
}

export function evaluateActualWriteGuard(input: ActualWriteGuardInput): ActualWriteGuardResult {
  if (input.status !== 'active') {
    return deny('Job status must be active to start or stop station bookings.');
  }

  return { allowed: true, reason: null };
}

function deny(reason: string): ActualWriteGuardResult {
  return { allowed: false, reason };
}
