import { fieldJobAccessMode, jobReadMode, openJobQueues, readableJobQueues } from '@pkg/domain/contracting';
import type { JobListInput, JobQueue } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { isNotFoundError } from '@/lib/trpc-errors';

const PAGE_SIZE = 25;

/** The Job list's sort choices: newest first, or by customer and farm. */
export const jobListSorts = ['newest', 'name'] as const;
export type JobListSort = (typeof jobListSorts)[number];
const sortInput: Record<JobListSort, Pick<JobListInput, 'sortBy' | 'sortDirection'>> = {
  newest: { sortBy: 'createdAt', sortDirection: 'desc' },
  name: { sortBy: 'customerName', sortDirection: 'asc' },
};

/** Whether this person may open a field Job: management works every Job, a Foreman their own. */
export function useCanReadJobs() {
  return fieldJobAccessMode(useSessionAccessSummary()) !== null;
}

/** The stages this person lists on the Jobs tab, and the open ones among them; with none, the tab reads nothing. */
export function useJobListAccess() {
  const access = useSessionAccessSummary();
  const mode = fieldJobAccessMode(access) ? jobReadMode(access) : null;
  const readable = mode ? readableJobQueues(mode) : [];
  const open = openJobQueues.filter((queue) => readable.includes(queue));
  return { canRead: readable.length > 0, readable, open };
}

/** The Job list web shows, a page at a time: searched, filtered by queue and sorted on the server. */
export function useJobList({
  search,
  queues,
  sort,
}: {
  search: string;
  queues: readonly JobQueue[];
  sort: JobListSort;
}) {
  const { canRead } = useJobListAccess();
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.contractingJobs.jobs.list.infiniteQueryOptions(
      { queues: [...queues], search, limit: PAGE_SIZE, ...sortInput[sort] },
      {
        enabled: canRead && queues.length > 0,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
}

/** How many Jobs sit in each queue for this person, for the filter's labels. */
export function useJobQueueCounts() {
  const { canRead } = useJobListAccess();
  const trpc = useTRPC();
  return useQuery(
    trpc.contractingJobs.jobs.queues.queryOptions(undefined, { enabled: canRead, select: (summary) => summary.counts }),
  );
}

/** One field Job, without money, read on its own so it opens whichever page of the list it came from. */
export function useJob(jobId: string) {
  const canRead = useCanReadJobs();
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJobs.field.job.queryOptions({ id: jobId }, { enabled: canRead && !!jobId }));
  // Not found once it has left this person's Jobs: finished for a Foreman, or reassigned.
  return { ...fieldQuery(canRead, query), gone: isNotFoundError(query.error) };
}

export function useImplements() {
  const canRead = useSessionPermission('contracting_machine:read', 'contracting_assignment:update-own');
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: canRead })),
  );
}

export function useDrivers() {
  const canRead = useSessionPermission('contracting_job:assign', 'contracting_assignment:update-own');
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: canRead })),
  );
}
