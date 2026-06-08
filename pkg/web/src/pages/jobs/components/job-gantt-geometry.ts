import { addDays } from 'date-fns';
import { type GanttContextProps, getGanttOffset, getGanttWidth } from '@/components/kibo-ui/gantt/index.js';
import { fromJobCalendarDateKey, toJobCalendarDate } from './job-date-key.js';

export function getJobGanttOffset(date: Date, gantt: GanttContextProps): number {
  return getGanttOffset(toJobCalendarDate(date), gantt);
}

export function getJobGanttOffsetDistance(startAt: Date, endAt: Date, gantt: GanttContextProps): number {
  return getJobGanttOffset(endAt, gantt) - getJobGanttOffset(startAt, gantt);
}

export function getJobGanttWidth(startAt: Date, endAt: Date | null, gantt: GanttContextProps): number {
  return getGanttWidth(toJobCalendarDate(startAt), endAt ? toJobCalendarDate(endAt) : null, gantt);
}

export function getJobCalendarDayOffset(dateKey: string, gantt: GanttContextProps): number {
  return getGanttOffset(fromJobCalendarDateKey(dateKey), gantt);
}

export function getJobCalendarDayWidth(dateKey: string, gantt: GanttContextProps): number {
  const startAt = fromJobCalendarDateKey(dateKey);

  return Math.max(getGanttWidth(startAt, addDays(startAt, 1), gantt), 1);
}
