import { type AssignmentActor, JobError, type JobReader } from '@pkg/core/contracting';
import { hasPermission } from '@pkg/domain';
import { jobReadMode } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';

/** Who is reading Jobs, and through which read mode; an actor with no Job read permission is refused. */
export function jobReader(access: UserAccessSummary, actorUserId: string): JobReader {
  const mode = jobReadMode(access);
  if (!mode) throw new JobError('contracting_job.forbidden', 'You do not have permission to view Jobs.');
  return { mode, actorUserId };
}

/** Whoever may assign works any open Job; a Foreman works only their own. */
export const assignmentActor = (access: UserAccessSummary): AssignmentActor =>
  hasPermission(access, 'contracting_job:assign') ? 'manager' : 'foreman';
