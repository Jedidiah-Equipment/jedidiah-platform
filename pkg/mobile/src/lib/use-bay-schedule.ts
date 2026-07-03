import {
  type ActiveJobProgress,
  deriveActiveJobProgress,
  findActiveWorkSlot,
  getJobDisplayName,
  listUpcomingWorkSlots,
  summarizeWorkSlotSpan,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';
import { useBayCalendars } from './use-bay-calendars';

/** The in-progress Work Slot a Bay is running today, projected for the ACTIVE NOW hero. */
export type BayQueueActiveJob = ActiveJobProgress & {
  slotId: string;
  jobCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string | null;
  customerCompanyName: string | null;
  /** Slot start, for the progress bar's start-month caption. */
  startDate: DateOnlyIso;
};

/**
 * One selectable Work Slot projected for the detail pane (#520): the status chip,
 * product card, SLOT grid, and JOB grid. Documents are fetched separately via
 * `jobs.get`, since the Board join carries only Slot + Job summary fields.
 */
export type BaySlotDetail = {
  jobId: string;
  jobCode: string;
  quoteCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string | null;
  customerCompanyName: string | null;
  bayName: string;
  /** 'in-progress' for the Slot running today, else 'scheduled'. */
  status: 'in-progress' | 'scheduled';
  /** The soonest upcoming Slot — its chip and timeline card share the 'next' accent. */
  isNext: boolean;
  /** Working days left — only the in-progress Slot has one. */
  remainingWorkDays: number | null;
  startDate: DateOnlyIso;
  /** Inclusive last working day (endDate − 1), matching the list pane's range labels. */
  lastWorkDay: DateOnlyIso;
  workDays: number;
};

/** A future Work Slot in the UP NEXT timeline. */
export type BayQueueUpcomingSlot = {
  slotId: string;
  jobCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  startDate: DateOnlyIso;
  /** The last booked working day (the day before the half-open `endDate`). */
  lastWorkDay: DateOnlyIso;
  workDays: number;
  /** The soonest upcoming Slot — highlighted as 'next' in the timeline. */
  isNext: boolean;
};

export type BayQueueState =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      bay: { id: string; name: string; operator: BayOperator | null };
      active: BayQueueActiveJob | null;
      upcoming: BayQueueUpcomingSlot[];
      /** Detail-pane projection for every selectable Slot, keyed by Slot id. */
      slotsById: Record<string, BaySlotDetail>;
      today: DateOnlyIso;
    };

/**
 * Loads one Bay's schedule for the ACTIVE NOW + UP NEXT panes from the cached Bay
 * schedule (`jobs.listBays`), whose `jobs` carry each scheduled Job's product and
 * customer detail, deriving the in-progress Slot's days-left and each upcoming
 * Work Slot's working-day span. Mirrors {@link useBayList}.
 */
export function useBaySchedule(bayId: string): BayQueueState {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bayCalendars = useBayCalendars();

  return useMemo<BayQueueState>(() => {
    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (baysQuery.isPending || !bayCalendars) return { status: 'pending' };

    const { items: bays, jobs, today } = baysQuery.data;
    const bay = bays.find((candidate) => candidate.id === bayId && candidate.disabledAt === null);
    if (!bay) return { status: 'not-found' };

    const workingCalendar = bayCalendars.workingCalendarsByBayId.get(bay.id) ?? {};
    const jobsById = new Map(jobs.map((job) => [job.id, job] as const));

    const activeSlot = findActiveWorkSlot({ bay });
    const activeJob = activeSlot ? jobsById.get(activeSlot.jobId) : undefined;
    const active: BayQueueActiveJob | null =
      activeSlot && activeJob
        ? {
            ...deriveActiveJobProgress({ slot: activeSlot, today, workingCalendar }),
            slotId: activeSlot.id,
            jobCode: activeSlot.jobCode,
            jobDisplayName: getJobDisplayName(activeJob),
            productThumbnailDataUrl: activeJob.productThumbnailDataUrl,
            productSerialNumber: activeJob.productSerialNumber,
            customerCompanyName: activeJob.customerCompanyName,
            startDate: activeSlot.startDate,
          }
        : null;

    // Everything still ahead: future Work Slots, excluding the active (covering-today) Slot.
    const upcomingSlots = listUpcomingWorkSlots({ bay, excludeSlotId: activeSlot?.id });

    // Detail-pane projection for the in-progress Slot and every upcoming one — the
    // Slots the list pane lets you select.
    const slotsById: Record<string, BaySlotDetail> = {};
    const addSlotDetail = (
      slot: ProjectedWorkJobSlot,
      status: BaySlotDetail['status'],
      remaining: number | null,
      isNext: boolean,
    ): BaySlotDetail => {
      const job = jobsById.get(slot.jobId);
      const { lastWorkDay, workDays } = summarizeWorkSlotSpan({ slot, workingCalendar });
      const detail: BaySlotDetail = {
        jobId: slot.jobId,
        jobCode: slot.jobCode,
        quoteCode: job?.quoteCode ?? '—',
        jobDisplayName: job ? getJobDisplayName(job) : slot.jobCode,
        productThumbnailDataUrl: job?.productThumbnailDataUrl ?? null,
        productSerialNumber: job?.productSerialNumber ?? null,
        customerCompanyName: job?.customerCompanyName ?? null,
        bayName: bay.name,
        status,
        isNext,
        remainingWorkDays: remaining,
        startDate: slot.startDate,
        lastWorkDay,
        workDays,
      };
      slotsById[slot.id] = detail;

      return detail;
    };
    if (activeSlot && active) addSlotDetail(activeSlot, 'in-progress', active.remainingWorkDays, false);

    // The UP NEXT list reuses each Slot's detail projection, so the working-day
    // span is derived exactly once per Slot.
    const upcoming = upcomingSlots.map<BayQueueUpcomingSlot>((slot, index) => {
      const detail = addSlotDetail(slot, 'scheduled', null, index === 0);

      return {
        slotId: slot.id,
        jobCode: detail.jobCode,
        jobDisplayName: detail.jobDisplayName,
        productThumbnailDataUrl: detail.productThumbnailDataUrl,
        startDate: detail.startDate,
        lastWorkDay: detail.lastWorkDay,
        workDays: detail.workDays,
        isNext: index === 0,
      };
    });

    return {
      status: 'ready',
      bay: { id: bay.id, name: bay.name, operator: bay.currentOperator },
      active,
      upcoming,
      slotsById,
      today,
    };
  }, [bayCalendars, bayId, baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
