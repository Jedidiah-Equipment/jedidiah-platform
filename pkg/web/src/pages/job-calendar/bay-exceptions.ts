import type { BayCalendarException, ProjectedBayQueue } from '@pkg/schema';
import { toJobCalendarDateKey } from '../jobs/components/job-date-key.js';
import type { BayExceptionChip } from './types.js';

export function isToday(date: Date): boolean {
  return toJobCalendarDateKey(date) === toJobCalendarDateKey(new Date());
}

export function groupBayExceptionChipsByDate(bays: ProjectedBayQueue[]): Map<string, BayExceptionChip[]> {
  const chipsByDate = new Map<string, BayExceptionChip[]>();

  for (const bay of bays) {
    for (const exception of bay.calendarExceptions) {
      const chips = chipsByDate.get(exception.date) ?? [];

      chips.push({
        bayId: bay.id,
        bayName: bay.name,
        date: exception.date,
        direction: exception.direction,
        label: exception.label,
      });
      chipsByDate.set(exception.date, chips);
    }
  }

  return chipsByDate;
}

export function getBayCalendarException(bay: ProjectedBayQueue, date: string): BayCalendarException | null {
  return bay.calendarExceptions.find((exception) => exception.date === date) ?? null;
}
