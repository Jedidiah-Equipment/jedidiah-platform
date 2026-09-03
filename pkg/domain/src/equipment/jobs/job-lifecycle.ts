import { type DateFormat, formatDate } from '../../formatting/date.js';

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

/** Where a Job sits in its lifecycle. The completed case carries its date so no surface re-reads it. */
export type JobLifecycleState =
  | { kind: 'cancelled' }
  | { kind: 'completed'; completedOn: Date | string }
  | { kind: 'in-progress' };

/**
 * Where a Job sits in its lifecycle, as the one state a surface reads instead of testing the two
 * timestamps itself. Cancellation wins: a cancelled Job was abandoned, never completed, and so it never
 * also reads as in progress. The state carries the completion date rather than a finished label because
 * each surface writes that date in its own format.
 */
export function resolveJobLifecycleState(
  job: JobCancellationFact & { completedOn: Date | string | null },
): JobLifecycleState {
  if (isJobCancelled(job)) return { kind: 'cancelled' };

  return job.completedOn === null ? { kind: 'in-progress' } : { kind: 'completed', completedOn: job.completedOn };
}

/**
 * Whether a Job can still be cancelled outright. Only one in progress can: a completion date is the
 * record that the work happened, and cancelling says it never will. This states the rule once for the
 * surfaces that decide whether to offer the action; the server refuses the two cases separately so it
 * can say which one it hit. The Quote cascade is not bound by it — that follows the sale, not the work.
 */
export function isJobCancellable(job: JobCancellationFact & { completedOn: Date | string | null }): boolean {
  return resolveJobLifecycleState(job).kind === 'in-progress';
}

/**
 * How a Job's lifecycle reads to a person. Every surface takes the words from here so the same Job can
 * never say one thing on a desk and another on a tablet — which is the drift that once let a cancelled
 * Job read as "In progress Cancelled". Only the date format is the caller's to choose.
 */
export function formatJobLifecycleStatus(
  job: JobCancellationFact & { completedOn: Date | string | null },
  dateFormat: DateFormat,
): string {
  const state = resolveJobLifecycleState(job);

  switch (state.kind) {
    case 'cancelled':
      return 'Cancelled';
    case 'completed':
      return `Completed ${formatDate(state.completedOn, dateFormat)}`;
    case 'in-progress':
      return 'In progress';
  }
}

/**
 * The one rule for what cancelling a Job gives back. A Work Slot is released only when it has not
 * started: done and active work stays on record as history. Both the path that does the releasing and
 * the surfaces that warn about it read this, so they can never drift on what "future" means.
 */
export function isReleasableJobSlot({ plantToday, startDate }: { plantToday: string; startDate: string }): boolean {
  return startDate > plantToday;
}
