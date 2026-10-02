import { fieldJobAccessMode } from '@pkg/domain/contracting';
import { useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

/** The operator's field Jobs in one read: the open ones, plus management's Jobs finished in the last 90 days. */
export function useJobs() {
  const mode = fieldJobAccessMode(useSessionAccessSummary());
  const canRead = mode !== null;
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(trpc.contractingJobs.field.jobs.queryOptions({ includeFinished: mode === 'all' }, { enabled: canRead })),
  );
}

/** One Job out of that list: undefined while the list loads, and once the Job has left it. */
export function useJob(jobId: string) {
  const jobs = useJobs();
  return { ...jobs, data: jobs.data?.find((job) => job.id === jobId) };
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
