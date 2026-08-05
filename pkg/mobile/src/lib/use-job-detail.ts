import { hasPermission } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { isJobNotFoundError, type JobDetailReadyState, projectJobDetail } from './job-detail-projection';
import { useTRPC } from './trpc';
import { useAccess } from './use-access';

export type { JobDetailReadyState, JobRouteStopCard } from './job-detail-projection';

export type JobDetailState =
  | { status: 'error'; error: unknown }
  | { status: 'forbidden' }
  | { status: 'pending' }
  | { status: 'not-found' }
  | JobDetailReadyState;

/**
 * Loads the full Job and schedule through `jobs.get`, including unscheduled and completed Jobs that
 * are absent from the Active Board. The Board remains the source of plant "today", org Off-Days,
 * and which Slot is next in each Bay Queue. Combining the two preserves the existing projection
 * semantics without making historical Jobs depend on the Board's bounded response window.
 */
export function useJobDetail(jobId: string): JobDetailState {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadJobs = hasPermission(accessQuery.data, 'job:read');
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: canReadJobs }));
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId as UUID }, { enabled: canReadJobs }));

  return useMemo<JobDetailState>(() => {
    if (accessQuery.isPending) return { status: 'pending' };
    if (accessQuery.error && accessQuery.data === undefined) return { status: 'error', error: accessQuery.error };
    if (!canReadJobs) return { status: 'forbidden' };

    if (jobQuery.error && isJobNotFoundError(jobQuery.error)) return { status: 'not-found' };
    if (baysQuery.error || jobQuery.error) return { status: 'error', error: baysQuery.error ?? jobQuery.error };
    if (baysQuery.isPending || jobQuery.isPending) return { status: 'pending' };

    return projectJobDetail(jobQuery.data, baysQuery.data);
  }, [
    accessQuery.data,
    accessQuery.error,
    accessQuery.isPending,
    baysQuery.data,
    baysQuery.error,
    baysQuery.isPending,
    canReadJobs,
    jobQuery.data,
    jobQuery.error,
    jobQuery.isPending,
  ]);
}
