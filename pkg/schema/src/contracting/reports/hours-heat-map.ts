import { z } from 'zod';
import { DateOnlyIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';

/** The longest range one heat map reads: a year and a leap day. */
export const maxHoursHeatMapDays = 366;
/** The range a heat map covers when it names no start: this many calendar months before its end. */
export const defaultHoursHeatMapMonths = 6;

const wholeDaysBetween = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;

/**
 * Omitted or empty `machineIds` / `jobIds` filter nothing on that dimension; both together are the intersection.
 * `end` defaults to today and `start` to six months before `end`; when both are named the range must run forwards and
 * span no more than `maxHoursHeatMapDays`.
 */
export const HoursHeatMapInput = z
  .object({
    machineIds: UUID.array().optional(),
    jobIds: UUID.array().optional(),
    start: DateOnlyIso.optional(),
    end: DateOnlyIso.optional(),
  })
  .strict()
  .refine(({ start, end }) => !start || !end || end >= start, {
    message: 'The end date cannot be before the start date.',
    path: ['end'],
  })
  .refine(({ start, end }) => !start || !end || wholeDaysBetween(start, end) <= maxHoursHeatMapDays, {
    message: `A heat map covers at most ${maxHoursHeatMapDays} days.`,
    path: ['end'],
  });
export type HoursHeatMapInput = z.infer<typeof HoursHeatMapInput>;

/** One plant day's Daily Hours; `estimated` when they were spread from a reading pair spanning several days. */
export const DailyHoursDay = z.object({
  date: DateOnlyIso,
  hours: z.number().nonnegative(),
  estimated: z.boolean(),
});
export type DailyHoursDay = z.infer<typeof DailyHoursDay>;

/** The resolved range and one entry per day in it, oldest first, 0 hours where nothing ran. */
export const HoursHeatMap = z.object({
  start: DateOnlyIso,
  end: DateOnlyIso,
  days: DailyHoursDay.array(),
});
export type HoursHeatMap = z.infer<typeof HoursHeatMap>;
