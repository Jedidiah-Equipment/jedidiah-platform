import {
  byBayDepartmentPipeline,
  deriveJobProgress,
  deriveJobRouteStop,
  hasPermission,
  type JobProgress,
  type JobRouteStop,
  type JobWorkSlotEntry,
  listEnabledBays,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso, Department, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';
import { useAccess } from './use-access';
import { useBayCalendars } from './use-bay-calendars';

/** One Bay on the Job's production-route timeline, projected from its Work Slot. */
export type JobRouteStopCard = JobRouteStop & {
  /** Slot id — stable key for the timeline. */
  slotId: string;
  bayId: UUID;
  bayName: string;
  department: Department;
  operator: BayOperator | null;
  startDate: DateOnlyIso;
};

export type JobDetailState =
  | { status: 'error'; error: unknown }
  | { status: 'forbidden' }
  | { status: 'pending' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      jobCode: string;
      quoteCode: string;
      productName: string;
      productSerialNumber: string;
      productThumbnailDataUrl: string | null;
      customerCompanyName: string | null;
      /** The Job's Bays in department-pipeline order, each with its state, dates, and progress. */
      route: JobRouteStopCard[];
      /** Shared days-left + overall-progress projection; `null` once the Job has no unfinished Slot. */
      progress: JobProgress | null;
      doneCount: number;
      totalCount: number;
      today: DateOnlyIso;
    };

/**
 * Loads the Job Detail from the same cached Board (`jobs.listBays`) the Job List reads, so a
 * tapped Job opens without a refetch. Collects the Job's Work Slots across every enabled Bay it
 * touches — mirroring {@link useJobList}'s `listEnabledBays` so retired Bays never leak in — and
 * projects the production-route stops and the shared {@link deriveJobProgress} summary. The two
 * always agree with the Job List card because both derive from the same Slots through the same seam.
 *
 * Documents are fetched separately with `jobs.get` in the detail pane, matching the per-Bay screen.
 * Gating matches {@link useJobList}: `jobs.listBays` requires `job:read`, surfaced as `forbidden`.
 */
export function useJobDetail(jobId: string): JobDetailState {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const canReadJobs = hasPermission(accessQuery.data, 'job:read');
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions(undefined, { enabled: canReadJobs }));
  const bayCalendars = useBayCalendars({ enabled: canReadJobs });

  return useMemo<JobDetailState>(() => {
    if (accessQuery.isPending) return { status: 'pending' };
    if (accessQuery.error && accessQuery.data === undefined) return { status: 'error', error: accessQuery.error };
    if (!canReadJobs) return { status: 'forbidden' };

    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (baysQuery.isPending || !bayCalendars) return { status: 'pending' };

    const { items, jobs, today } = baysQuery.data;
    const bays = listEnabledBays(items).sort(byBayDepartmentPipeline);
    const job = jobs.find((candidate) => candidate.id === jobId);

    // Walk the Bays in pipeline order so the route reads procurement → assembly; each Bay's Slots
    // already arrive in queue order. Collect the same entries the shared projection consumes.
    const entries: JobWorkSlotEntry[] = [];
    const route: JobRouteStopCard[] = [];
    for (const bay of bays) {
      const workingCalendar = bayCalendars.workingCalendarsByBayId.get(bay.id) ?? {};
      for (const slot of bay.slots) {
        if (slot.kind !== 'work' || slot.jobId !== jobId) continue;
        entries.push({ slot, bayName: bay.name, workingCalendar });
        route.push({
          ...deriveJobRouteStop({ slot, today, workingCalendar }),
          slotId: slot.id,
          bayId: bay.id,
          bayName: bay.name,
          department: bay.department,
          operator: bay.currentOperator,
          startDate: slot.startDate,
        });
      }
    }

    // The Job holds no Work Slot on any enabled Bay (never scheduled, or only on retired Bays),
    // or its summary failed to resolve — nothing to route.
    if (entries.length === 0 || !job) return { status: 'not-found' };

    return {
      status: 'ready',
      jobCode: job.code,
      quoteCode: job.quoteCode,
      productName: job.productName,
      productSerialNumber: job.productSerialNumber,
      productThumbnailDataUrl: job.productThumbnailDataUrl,
      customerCompanyName: job.customerCompanyName,
      route,
      progress: deriveJobProgress({ slots: entries, today }),
      doneCount: route.filter((stop) => stop.state === 'done').length,
      totalCount: route.length,
      today,
    };
  }, [
    accessQuery.data,
    accessQuery.error,
    accessQuery.isPending,
    bayCalendars,
    baysQuery.data,
    baysQuery.error,
    baysQuery.isPending,
    canReadJobs,
    jobId,
  ]);
}
