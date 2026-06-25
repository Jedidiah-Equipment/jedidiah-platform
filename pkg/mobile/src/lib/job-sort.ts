import type { JobListCard } from './use-job-list';

/**
 * Orders the Job grid client-side. There is no sort control in Jobs mode: Jobs always read
 * days-left ascending, so the work coming off the floor soonest sits at the top, tie-broken by
 * Job code for a stable order. Returns a new array.
 */
export function sortJobCards(cards: readonly JobListCard[]): JobListCard[] {
  return [...cards].sort(
    (left, right) => left.progress.daysLeft - right.progress.daysLeft || left.jobCode.localeCompare(right.jobCode),
  );
}
