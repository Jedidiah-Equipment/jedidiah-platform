import type { WorkingCalendar } from '@pkg/domain';
import {
  type Bay,
  type BayListResult,
  type BaySchedule,
  DateOnlyIsoString,
  JobCreateInput,
  type ProductBay,
  type QuoteDetail,
  SlotDurationDays,
  UUID,
} from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';
import { createWorkingCalendarsByBayId } from '@/pages/jobs/components/bay-schedule-summary.js';
import {
  describeInsertAtDatePlacement,
  getInsertAtDatePickerBounds,
  resolveBookSlotPlacement,
} from '@/pages/jobs/components/book-slot-insert-at-date.js';

export type JobBaySeedFormValues = z.infer<typeof JobBaySeedFormValues>;
export const JobBaySeedFormValues = z.object({
  bayId: UUID,
  durationDays: SlotDurationDays,
  /** DatePicker raw value; `''` means plain append (no schedule data for the Bay). */
  startDate: emptyStringOr(DateOnlyIsoString),
});

export type JobCreateFormValues = z.infer<typeof JobCreateFormValues>;
export const JobCreateFormValues = z.object({
  baySeeds: z.array(JobBaySeedFormValues),
});

/** Per-Bay scheduling context for seed rows, derived once from the Bay schedule read. */
export type BaySeedScheduling = {
  schedulesByBayId: Map<UUID, BaySchedule>;
  today: BayListResult['today'];
  workingCalendarsByBayId: Map<string, WorkingCalendar>;
};

export function createBaySeedScheduling(result: Pick<BayListResult, 'items' | 'offDays' | 'today'>): BaySeedScheduling {
  return {
    schedulesByBayId: new Map(result.items.map((bay) => [bay.id, bay])),
    today: result.today,
    workingCalendarsByBayId: createWorkingCalendarsByBayId(result.items, result.offDays),
  };
}

/**
 * A seed row's default start date is the Bay's next available working day, floored to
 * tomorrow — the same value the Book Slot picker defaults to. Empty when the Bay has
 * no schedule data (the seed then appends, exactly as a date-less booking).
 */
export function getBaySeedDefaultStartDate(scheduling: BaySeedScheduling | null, bayId: UUID): string {
  const bay = scheduling?.schedulesByBayId.get(bayId);

  if (!scheduling || !bay) {
    return '';
  }

  const workingCalendar = scheduling.workingCalendarsByBayId.get(bayId) ?? {};

  return getInsertAtDatePickerBounds(bay, workingCalendar, scheduling.today).maxValue;
}

export type BaySeedRowScheduling = {
  bounds: { minValue: string; maxValue: string };
  workingCalendar: WorkingCalendar;
  /** Tooltip copy when the row's date will split an existing Slot; null otherwise. */
  splitWarning: string | null;
};

export function getBaySeedRowScheduling(
  scheduling: BaySeedScheduling | null,
  row: { bayId: UUID; startDate: string },
): BaySeedRowScheduling | null {
  const bay = scheduling?.schedulesByBayId.get(row.bayId);

  if (!scheduling || !bay) {
    return null;
  }

  const workingCalendar = scheduling.workingCalendarsByBayId.get(row.bayId) ?? {};
  const placement = DateOnlyIsoString.safeParse(row.startDate).success
    ? resolveBookSlotPlacement({
        bay,
        startDate: row.startDate,
        today: scheduling.today,
        workingCalendar,
      })
    : null;

  return {
    bounds: getInsertAtDatePickerBounds(bay, workingCalendar, scheduling.today),
    splitWarning: placement ? describeInsertAtDatePlacement(placement).splitWarning : null,
    workingCalendar,
  };
}

export function toJobCreateFormValues({
  productBays,
  scheduling,
}: {
  productBays: QuoteDetail['productBays'];
  scheduling: BaySeedScheduling | null;
}): JobCreateFormValues {
  return {
    baySeeds: productBays
      .filter((productBay) => !productBay.bay.disabledAt)
      .map((productBay) => ({
        bayId: productBay.bayId,
        durationDays: productBay.defaultWorkingDays,
        startDate: getBaySeedDefaultStartDate(scheduling, productBay.bayId),
      })),
  };
}

export function toJobCreateInput({ quoteId, value }: { quoteId: UUID; value: JobCreateFormValues }): JobCreateInput {
  // `job:create` implies `job:schedule` (see appRoleAccess), so seed dates need no
  // permission stripping; an empty date is the missing-schedule-data append fallback.
  return JobCreateInput.parse({
    baySeeds: value.baySeeds.map((seed) => ({
      bayId: seed.bayId,
      durationDays: seed.durationDays,
      ...(seed.startDate ? { startDate: seed.startDate } : {}),
    })),
    quoteId,
  });
}

export function getBaySeedBayMap({
  enabledBays,
  productBays,
}: {
  enabledBays: Bay[];
  productBays: ProductBay[];
}): Map<UUID, Bay> {
  const baysById = new Map<UUID, Bay>(enabledBays.map((bay) => [bay.id, bay]));

  for (const productBay of productBays) {
    if (!productBay.bay.disabledAt) {
      baysById.set(productBay.bayId, productBay.bay);
    }
  }

  return baysById;
}
