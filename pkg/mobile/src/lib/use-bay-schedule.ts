import {
  type ActiveJobProgress,
  deriveActiveJobProgress,
  findActiveWorkSlot,
  getJobDisplayName,
  isJobCancelled,
  listUpcomingWorkSlots,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';
import { useBayCalendars } from './use-bay-calendars';

/** The in-progress Work Slot a Bay is running today, projected for the ACTIVE NOW hero. */
export type BayQueueActiveJob = ActiveJobProgress & {
  isCancelled: boolean;
  slotId: string;
  jobCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string | null;
  customerCompanyName: string | null;
  /** Slot's first working day, for the progress bar's start-month caption. */
  firstWorkDay: DateOnlyIso;
};

/**
 * One selectable Work Slot projected for the detail pane (#520): the status chip,
 * product card, SLOT grid, and JOB grid. Documents are fetched separately via
 * `jobs.get`, since the Board join carries only Slot + Job summary fields.
 */
export type BaySlotDetail = {
  isCancelled: boolean;
  jobId: string;
  jobCode: string;
  quoteCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string | null;
  customerCompanyName: string | null;
  description: string | null;
  bayName: string;
  /** 'in-progress' for the Slot running today, else 'scheduled'. */
  status: 'done' | 'in-progress' | 'scheduled';
  /** The soonest upcoming Slot — its chip and timeline card share the 'next' accent. */
  isNext: boolean;
  /** Working days left — only the in-progress Slot has one. */
  remainingWorkDays: number | null;
  /** Inclusive first working day, matching the list pane's range labels. */
  firstWorkDay: DateOnlyIso;
  /** Inclusive last working day, matching the list pane's range labels. */
  lastWorkDay: DateOnlyIso;
  workDays: number;
};

/** A Work Slot on a Bay's timeline — a past `done` Slot in HISTORY or a future `scheduled` one in UP NEXT. */
export type BayQueueTimelineSlot = {
  isCancelled: boolean;
  slotId: string;
  jobCode: string;
  jobDisplayName: string;
  productThumbnailDataUrl: string | null;
  /** The first booked working day; the Slot's queue span can open on an off-day. */
  firstWorkDay: DateOnlyIso;
  /** The last booked working day. */
  lastWorkDay: DateOnlyIso;
  workDays: number;
  /** The soonest upcoming Slot — highlighted as 'next' in the timeline. */
  isNext: boolean;
  status: 'done' | 'scheduled';
};

export type BayQueueState =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      bay: { id: string; name: string; operator: BayOperator | null };
      active: BayQueueActiveJob | null;
      history: BayQueueTimelineSlot[];
      upcoming: BayQueueTimelineSlot[];
      /** Detail-pane projection for every selectable Slot, keyed by Slot id. */
      slotsById: Record<string, BaySlotDetail>;
      today: DateOnlyIso;
    };

/**
 * Loads one Bay's schedule for the ACTIVE NOW, UP NEXT, and HISTORY panes from the
 * cached Bay schedule (`jobs.listBays`), whose `jobs` carry each scheduled Job's
 * product and customer detail, deriving the in-progress Slot's days-left and each
 * timeline Slot's working-day span. Mirrors {@link useBayList}.
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
            isCancelled: isJobCancelled(activeJob),
            slotId: activeSlot.id,
            jobCode: activeSlot.jobCode,
            jobDisplayName: getJobDisplayName(activeJob),
            productThumbnailDataUrl: activeJob.productThumbnailDataUrl,
            productSerialNumber: activeJob.productSerialNumber,
            customerCompanyName: activeJob.customerCompanyName,
            firstWorkDay: activeSlot.firstWorkDay,
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
      const detail: BaySlotDetail = {
        jobId: slot.jobId,
        jobCode: slot.jobCode,
        quoteCode: job?.quoteCode ?? '—',
        jobDisplayName: job ? getJobDisplayName(job) : slot.jobCode,
        productThumbnailDataUrl: job?.productThumbnailDataUrl ?? null,
        productSerialNumber: job?.productSerialNumber ?? null,
        customerCompanyName: job?.customerCompanyName ?? null,
        description: job?.description ?? null,
        bayName: bay.name,
        status,
        isNext,
        isCancelled: isJobCancelled(job),
        remainingWorkDays: remaining,
        firstWorkDay: slot.firstWorkDay,
        lastWorkDay: slot.lastWorkDay,
        // Projection consumes exactly `durationDays` working days, so the span's working-day
        // count is the stored duration.
        workDays: slot.durationDays,
      };
      slotsById[slot.id] = detail;

      return detail;
    };
    if (activeSlot && active) addSlotDetail(activeSlot, 'in-progress', active.remainingWorkDays, false);

    const history = bay.slots
      .filter((slot): slot is ProjectedWorkJobSlot => slot.kind === 'work' && slot.state === 'done')
      .map<BayQueueTimelineSlot>((slot) => {
        const detail = addSlotDetail(slot, 'done', null, false);

        return {
          firstWorkDay: detail.firstWorkDay,
          isCancelled: detail.isCancelled,
          isNext: false,
          jobCode: detail.jobCode,
          jobDisplayName: detail.jobDisplayName,
          lastWorkDay: detail.lastWorkDay,
          productThumbnailDataUrl: detail.productThumbnailDataUrl,
          slotId: slot.id,
          status: 'done',
          workDays: detail.workDays,
        };
      });

    // The UP NEXT list reuses each Slot's detail projection, so the working-day
    // span is derived exactly once per Slot.
    const liveUpcomingSlots = upcomingSlots.filter((slot) => {
      const job = jobsById.get(slot.jobId);

      return job != null && !isJobCancelled(job);
    });
    const upcoming = liveUpcomingSlots.map<BayQueueTimelineSlot>((slot, index) => {
      const detail = addSlotDetail(slot, 'scheduled', null, index === 0);

      return {
        slotId: slot.id,
        jobCode: detail.jobCode,
        jobDisplayName: detail.jobDisplayName,
        productThumbnailDataUrl: detail.productThumbnailDataUrl,
        firstWorkDay: detail.firstWorkDay,
        lastWorkDay: detail.lastWorkDay,
        workDays: detail.workDays,
        isNext: index === 0,
        isCancelled: detail.isCancelled,
        status: 'scheduled',
      };
    });

    return {
      status: 'ready',
      bay: { id: bay.id, name: bay.name, operator: bay.currentOperator },
      active,
      history,
      upcoming,
      slotsById,
      today,
    };
  }, [bayCalendars, bayId, baysQuery.data, baysQuery.error, baysQuery.isPending]);
}
