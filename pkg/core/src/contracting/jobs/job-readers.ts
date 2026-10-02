import { contractingJobs } from '@pkg/db/contracting';
import {
  fieldJobAccessMode,
  type JobActor,
  type JobReadMode,
  jobReadMode,
  jobReadStatuses,
} from '@pkg/domain/contracting';
import { hasJobStatus, type JobStatus } from '@pkg/schema/contracting';
import { and, eq, inArray } from 'drizzle-orm';
import { JobError } from './job-errors.js';

/** Who is reading Jobs, and through which read mode. */
export type JobReader = { mode: JobReadMode; actorUserId: string };
/** Who is reading the phone's field Jobs. */
export type FieldReader = { mode: 'all' | 'own'; actorUserId: string };

/** The read mode a person reads Jobs through; one with no Job read permission is refused. */
export function readerFor(actor: JobActor): JobReader {
  const mode = jobReadMode(actor);
  if (!mode) throw new JobError('contracting_job.forbidden', 'You do not have permission to view Jobs.');
  return { mode, actorUserId: actor.userId };
}

/** The phone's reader; one who is neither management nor a Foreman is refused. */
export function fieldReaderFor(actor: JobActor): FieldReader {
  const mode = fieldJobAccessMode(actor);
  if (!mode) throw new JobError('contracting_job.not_owner', 'You do not have access to field Jobs.');
  return { mode, actorUserId: actor.userId };
}

/** A reader in `own` mode sees only the Jobs they are Foreman on. */
export const ownedBy = ({ mode, actorUserId }: JobReader | FieldReader) =>
  mode === 'own' ? eq(contractingJobs.foremanUserId, actorUserId) : undefined;

/** The Jobs a reader may see: their mode's statuses, and a Foreman's own Jobs only. */
export const readableBy = (reader: JobReader) =>
  and(inArray(contractingJobs.status, [...jobReadStatuses[reader.mode]]), ownedBy(reader));

const readRefusals: Record<JobReadMode, string> = {
  all: 'You do not have permission to view this Job.',
  own: 'Foremen can only view their open and completed Jobs.',
  priced: 'Invoicing can only view Completed, Priced, or Invoiced Jobs.',
};

/** Refuses a status outside the reader's mode: a queue they may not list, a Job they may not open. */
export function assertReadableStatus(status: JobStatus, reader: JobReader) {
  if (!hasJobStatus(jobReadStatuses[reader.mode], status))
    throw new JobError('contracting_job.forbidden', readRefusals[reader.mode]);
}
