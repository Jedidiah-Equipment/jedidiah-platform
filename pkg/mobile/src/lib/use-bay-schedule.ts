import {
  type ActiveJobProgress,
  addDateOnlyDays,
  bayWorkingCalendar,
  countWorkingDaysBetween,
  deriveActiveJobProgress,
  isWorkingDay,
} from '@pkg/domain';
import type { BayOperator, DateOnlyIso, ProjectedWorkJobSlot } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from './trpc';

/** The in-progress Work Slot a Bay is running today, projected for the ACTIVE NOW hero. */
export type BayScheduleActiveJob = ActiveJobProgress & {
  slotId: string;
  jobCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string;
  customerCompanyName: string | null;
  /** Slot start, for the progress bar's start-month caption. */
  startDate: DateOnlyIso;
};

/**
 * One selectable Work Slot projected for the detail pane (#520): the status chip,
 * product card, SLOT grid, and JOB grid. Documents are fetched separately via
 * `jobs.get`, since the schedule join carries only Slot + Job summary fields.
 */
export type BaySlotDetail = {
  jobId: string;
  jobCode: string;
  quoteCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
  productSerialNumber: string;
  customerCompanyName: string | null;
  bayName: string;
  /** 'in-progress' for the Slot running today, else 'scheduled'. */
  status: 'in-progress' | 'scheduled';
  /** Working days left — only the in-progress Slot has one. */
  remainingWorkDays: number | null;
  startDate: DateOnlyIso;
  /** Inclusive last working day (endDate − 1), matching the list pane's range labels. */
  lastWorkDay: DateOnlyIso;
  workDays: number;
};

/** A future Work Slot in the UP NEXT timeline. */
export type BayScheduleUpcomingSlot = {
  slotId: string;
  jobCode: string;
  productName: string;
  productThumbnailDataUrl: string | null;
  startDate: DateOnlyIso;
  /** The last booked working day (the day before the half-open `endDate`). */
  lastWorkDay: DateOnlyIso;
  workDays: number;
  /** The soonest upcoming Slot — highlighted as 'next' in the timeline. */
  isNext: boolean;
};

export type BayScheduleState =
  | { status: 'error'; error: unknown }
  | { status: 'pending' }
  | { status: 'not-found' }
  | {
      status: 'ready';
      bay: { id: string; name: string; operator: BayOperator | null };
      active: BayScheduleActiveJob | null;
      upcoming: BayScheduleUpcomingSlot[];
      /** Detail-pane projection for every selectable Slot, keyed by Slot id. */
      slotsById: Record<string, BaySlotDetail>;
      today: DateOnlyIso;
    };

// Unpaged read so every Slot's Job resolves to a product/customer in one cached query
// (mirrors `useBayList`; tRPC batches it with the Bay list round-trip).
const allJobsInput = {
  filters: {},
  page: 1,
  pageSize: 0,
  search: '',
  sortBy: 'createdAt',
  sortDirection: 'desc',
} as const;

/**
 * Loads one Bay's schedule for the ACTIVE NOW + UP NEXT panes: the cached Bay
 * schedule (`jobs.listBays`) joined with the Job list (`jobs.list`) for product
 * and customer detail, deriving the in-progress Slot's days-left and each
 * upcoming Work Slot's working-day span. Mirrors {@link useBayList}'s join.
 */
export function useBaySchedule(bayId: string): BayScheduleState {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const jobsQuery = useQuery(trpc.jobs.list.queryOptions(allJobsInput));

  return useMemo<BayScheduleState>(() => {
    if (baysQuery.error) return { status: 'error', error: baysQuery.error };
    if (jobsQuery.error) return { status: 'error', error: jobsQuery.error };
    if (baysQuery.isPending || jobsQuery.isPending) return { status: 'pending' };

    const { items: bays, offDays, today } = baysQuery.data;
    const bay = bays.find((candidate) => candidate.id === bayId && candidate.disabledAt === null);
    if (!bay) return { status: 'not-found' };

    const workingCalendar = bayWorkingCalendar(new Set(offDays.map((offDay) => offDay.date)), bay.calendarExceptions);
    const jobsById = new Map(jobsQuery.data.items.map((job) => [job.id, job] as const));
    const workSlots = bay.slots.filter((slot): slot is ProjectedWorkJobSlot => slot.kind === 'work');

    // The in-progress Slot covers today, but only counts as active on a day the Bay
    // actually works (projected Slots span closure days), mirroring `useBayList`.
    const activeSlot = isWorkingDay(today, workingCalendar)
      ? workSlots.find((slot) => slot.startDate <= today && today < slot.endDate)
      : undefined;

    const activeJob = activeSlot ? jobsById.get(activeSlot.jobId) : undefined;
    const active: BayScheduleActiveJob | null =
      activeSlot && activeJob
        ? {
            ...deriveActiveJobProgress({ slot: activeSlot, today, workingCalendar }),
            slotId: activeSlot.id,
            jobCode: activeSlot.jobCode,
            productName: activeJob.productName,
            productThumbnailDataUrl: activeJob.productThumbnailDataUrl,
            productSerialNumber: activeJob.productSerialNumber,
            customerCompanyName: activeJob.customerCompanyName,
            startDate: activeSlot.startDate,
          }
        : null;

    // Everything still ahead: future Work Slots, plus a Slot covering today that the
    // off-day gate excluded from `active` (so it is never silently dropped).
    const upcomingSlots = workSlots.filter((slot) => slot.id !== activeSlot?.id && slot.endDate > today);

    // Detail-pane projection for the in-progress Slot and every upcoming one — the
    // Slots the list pane lets you select.
    const slotsById: Record<string, BaySlotDetail> = {};
    const addSlotDetail = (
      slot: ProjectedWorkJobSlot,
      status: BaySlotDetail['status'],
      remaining: number | null,
    ): BaySlotDetail => {
      const job = jobsById.get(slot.jobId);
      const detail: BaySlotDetail = {
        jobId: slot.jobId,
        jobCode: slot.jobCode,
        quoteCode: job?.quoteCode ?? '—',
        productName: job?.productName ?? slot.jobCode,
        productThumbnailDataUrl: job?.productThumbnailDataUrl ?? null,
        productSerialNumber: job?.productSerialNumber ?? '—',
        customerCompanyName: job?.customerCompanyName ?? null,
        bayName: bay.name,
        status,
        remainingWorkDays: remaining,
        startDate: slot.startDate,
        lastWorkDay: addDateOnlyDays(slot.endDate, -1),
        workDays: countWorkingDaysBetween(slot.startDate, slot.endDate, workingCalendar),
      };
      slotsById[slot.id] = detail;

      return detail;
    };
    if (activeSlot && active) addSlotDetail(activeSlot, 'in-progress', active.remainingWorkDays);

    // The UP NEXT list reuses each Slot's detail projection, so the working-day
    // span is derived exactly once per Slot.
    const upcoming = upcomingSlots.map<BayScheduleUpcomingSlot>((slot, index) => {
      const detail = addSlotDetail(slot, 'scheduled', null);

      return {
        slotId: slot.id,
        jobCode: detail.jobCode,
        productName: detail.productName,
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
  }, [
    bayId,
    baysQuery.data,
    baysQuery.error,
    baysQuery.isPending,
    jobsQuery.data,
    jobsQuery.error,
    jobsQuery.isPending,
  ]);
}
