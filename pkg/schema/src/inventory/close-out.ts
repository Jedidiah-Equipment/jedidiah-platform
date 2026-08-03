import { z } from 'zod';
import { AuthId } from '../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../common/date.js';
import { JobCode } from '../common/public-code.js';
import { nullableTrimmedText, nullableTrimmedTextInput } from '../common/text.js';
import { UUID } from '../common/uuid.js';

/**
 * Close-out is job-level in v1: one motion ends a Job's stock life, so the Job is the whole input.
 * Returning leftovers happens first through the ordinary return-to-store path.
 */
export type CloseOutJobInput = z.infer<typeof CloseOutJobInput>;
export const CloseOutJobInput = z.object({ jobId: UUID, note: nullableTrimmedTextInput() }).strict();

/** The immutable assertion that a Job's stock life ended — inserted once, never edited or undone. */
export type JobCloseOut = z.infer<typeof JobCloseOut>;
export const JobCloseOut = z.object({
  actorUserId: AuthId,
  closedOutAt: DateIso,
  jobId: UUID,
  note: nullableTrimmedText(),
});

export type CloseOutQueueRow = z.infer<typeof CloseOutQueueRow>;
export const CloseOutQueueRow = z.object({
  /** Plant business days since Job Completion; the queue's age column is the stale-commitment report. */
  ageDays: z.int().nonnegative(),
  code: JobCode,
  committedQuantity: z.number().finite(),
  completedOn: DateOnlyIso,
  displayName: z.string(),
  /** Checked out and not yet returned — the leftovers still sitting against the Job. */
  drawnQuantity: z.number().finite(),
  isStale: z.boolean(),
  jobId: UUID,
});

export type CloseOutQueueResult = z.infer<typeof CloseOutQueueResult>;
export const CloseOutQueueResult = z.object({ items: z.array(CloseOutQueueRow) });
