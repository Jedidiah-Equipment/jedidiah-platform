import type { JobListCard } from './use-job-list';

export type JobSort = 'days-left' | 'newest';

export function isJobSort(value: unknown): value is JobSort {
  return value === 'days-left' || value === 'newest';
}

/** Orders the Job grid by urgency or creation date, with Job code as a stable tie-breaker. */
export function sortJobCards(cards: readonly JobListCard[], sort: JobSort): JobListCard[] {
  const byCode = (left: JobListCard, right: JobListCard) => left.jobCode.localeCompare(right.jobCode);

  if (sort === 'newest') {
    return [...cards].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || byCode(left, right));
  }

  return [...cards].sort((left, right) => left.progress.daysLeft - right.progress.daysLeft || byCode(left, right));
}
