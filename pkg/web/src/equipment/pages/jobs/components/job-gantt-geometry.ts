import { addJobSlotDuration, type WorkingCalendar } from '@pkg/domain';
import type { DateOnlyIso } from '@pkg/schema';
import { addDays } from 'date-fns';
import { type GanttContextProps, getGanttOffset, getGanttWidth } from '@/components/kibo-ui/gantt/index.js';
import { fromJobCalendarDateKey } from './job-date-key.js';

export function getJobGanttOffset(dateKey: DateOnlyIso, gantt: GanttContextProps): number {
  return getGanttOffset(fromJobCalendarDateKey(dateKey), gantt);
}

export function getJobGanttOffsetDistance(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso,
  gantt: GanttContextProps,
): number {
  return getJobGanttOffset(endDate, gantt) - getJobGanttOffset(startDate, gantt);
}

export function getJobGanttWidth(
  startDate: DateOnlyIso,
  endDate: DateOnlyIso | null,
  gantt: GanttContextProps,
): number {
  if (!endDate) {
    return getGanttWidth(fromJobCalendarDateKey(startDate), null, gantt);
  }

  return Math.max(getJobGanttOffsetDistance(startDate, endDate, gantt), 1);
}

export function getJobGanttResizeStepWidth(
  currentEndDate: DateOnlyIso,
  workingCalendar: WorkingCalendar,
  gantt: GanttContextProps,
): number {
  const nextEndDate = addJobSlotDuration(currentEndDate, 1, workingCalendar);

  return Math.max(getJobGanttWidth(currentEndDate, nextEndDate, gantt), 1);
}

export function getJobCalendarDayOffset(dateKey: DateOnlyIso, gantt: GanttContextProps): number {
  return getGanttOffset(fromJobCalendarDateKey(dateKey), gantt);
}

export function getJobCalendarDayWidth(dateKey: DateOnlyIso, gantt: GanttContextProps): number {
  const startAt = fromJobCalendarDateKey(dateKey);

  return Math.max(getGanttWidth(startAt, addDays(startAt, 1), gantt), 1);
}
