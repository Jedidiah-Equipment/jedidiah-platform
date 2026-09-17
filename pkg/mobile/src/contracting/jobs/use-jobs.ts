import { FieldDriver, FieldImplement, FieldJob } from '@pkg/schema/contracting';
import { type UseQueryResult, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { z } from 'zod';
import { contractingStorageKey } from '@/contracting/lib/contracting-storage';
import { apiBaseUrl } from '@/lib/api-base-url';
import { useAuthSession, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { usePersistedState } from '@/lib/use-persisted-state';

const FieldJobs = FieldJob.array();
const FieldImplements = FieldImplement.array();
const FieldDrivers = FieldDriver.array();
const isFieldJobs = (value: unknown): value is z.infer<typeof FieldJobs> => FieldJobs.safeParse(value).success;
const isFieldJob = (value: unknown): value is z.infer<typeof FieldJob> => FieldJob.safeParse(value).success;
const isFieldImplements = (value: unknown): value is z.infer<typeof FieldImplements> =>
  FieldImplements.safeParse(value).success;
const isFieldDrivers = (value: unknown): value is z.infer<typeof FieldDrivers> => FieldDrivers.safeParse(value).success;

type SavedQuery<T> = {
  canRead: boolean;
  data: T | undefined;
  isError: boolean;
  isFetching: boolean;
  isRefetching: boolean;
  refetch: () => Promise<unknown>;
};

function useSavedQueryData<T>(
  namespace: readonly string[],
  isValid: (value: unknown) => value is T,
  live: T | undefined,
) {
  const session = useAuthSession();
  const [scope, version, ...suffix] = namespace;
  const key = contractingStorageKey(scope ?? 'field', version ?? 'v1', apiBaseUrl, session.user.id, ...suffix);
  const [saved, save] = usePersistedState<T | undefined>(key, undefined, isValid);
  useEffect(() => {
    if (live !== undefined) save(live);
  }, [live, save]);
  return live ?? saved;
}

function savedQuery<T>(canRead: boolean, query: UseQueryResult<T, unknown>, data: T | undefined): SavedQuery<T> {
  return {
    canRead,
    data: canRead ? data : undefined,
    isError: query.isError,
    isFetching: query.isFetching,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
  };
}

export function useJobs() {
  const canRead = useSessionPermission('contracting_job:read', 'contracting_job:read-own');
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJobs.field.jobs.queryOptions(undefined, { enabled: canRead }));
  return savedQuery(canRead, query, useSavedQueryData(['jobs', 'v1'], isFieldJobs, query.data));
}

export function useJob(jobId: string) {
  const jobs = useJobs();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingJobs.field.job.queryOptions({ id: jobId }, { enabled: jobs.canRead && !!jobId }),
  );
  const live = query.data ?? jobs.data?.find((job) => job.id === jobId);
  return savedQuery(jobs.canRead, query, useSavedQueryData(['jobs', 'v1', jobId], isFieldJob, live));
}

export function useImplements() {
  const canRead = useSessionPermission('contracting_machine:read', 'contracting_assignment:update-own');
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled: canRead }));
  return savedQuery(canRead, query, useSavedQueryData(['fleet', 'v2', 'implements'], isFieldImplements, query.data));
}

export function useDrivers() {
  const canRead = useSessionPermission('contracting_job:assign', 'contracting_assignment:update-own');
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled: canRead }));
  return savedQuery(canRead, query, useSavedQueryData(['fleet', 'v2', 'drivers'], isFieldDrivers, query.data));
}
