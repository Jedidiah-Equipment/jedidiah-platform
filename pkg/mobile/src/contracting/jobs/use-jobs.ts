import { fieldJobAccessMode, hasJobCard } from '@pkg/domain/contracting';
import type { FieldJob } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';

export function useJobs() {
  const canRead = fieldJobAccessMode(useSessionAccessSummary()) !== null;
  const trpc = useTRPC();
  return fieldQuery(canRead, useQuery(trpc.contractingJobs.field.jobs.queryOptions(undefined, { enabled: canRead })));
}

export const isFinishedJob = (job: Pick<FieldJob, 'status'>) => hasJobCard(job.status);

/** Management's Jobs finished in the last 90 days. */
export function useFinishedJobs() {
  const canRead = fieldJobAccessMode(useSessionAccessSummary()) === 'all';
  const trpc = useTRPC();
  return fieldQuery(
    canRead,
    useQuery(
      trpc.contractingJobs.field.jobs.queryOptions(
        { includeFinished: true },
        { enabled: canRead, select: (jobs) => jobs.filter(isFinishedJob) },
      ),
    ),
  );
}

export function useJob(jobId: string) {
  const jobs = useJobs();
  const finished = useFinishedJobs();
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingJobs.field.job.queryOptions({ id: jobId }, { enabled: jobs.canRead && !!jobId }),
  );
  const listed = [...(jobs.data ?? []), ...(finished.data ?? [])].find((job) => job.id === jobId);
  // A Job that has left both lists is no longer the operator's, even while its own read is cached.
  const disappeared = jobs.isSuccess && (!finished.canRead || finished.isSuccess) && listed === undefined;
  const result = fieldQuery(jobs.canRead, query);
  return { ...result, data: disappeared ? undefined : (result.data ?? (jobs.canRead ? listed : undefined)) };
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
