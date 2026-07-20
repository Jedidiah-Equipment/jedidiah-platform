/** A Job (or a Slot's Job summary) carrying the cancellation timestamp, however each layer types it. */
export type JobCancellationFact = { cancelledAt: Date | string | null };

/**
 * Whether a Job has been cancelled. Cancellation is terminal, so `cancelledAt` being set is the single
 * signal every surface styles, filters, and freezes on. Accepts a missing Job (a Slot whose Job summary
 * did not resolve is treated as not cancelled) so callers can pass `slot.job` directly.
 */
export function isJobCancelled(job: JobCancellationFact | null | undefined): boolean {
  return job?.cancelledAt != null;
}
