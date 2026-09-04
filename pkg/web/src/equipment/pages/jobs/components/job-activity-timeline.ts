import { formatDate, parseDate } from '@pkg/domain';
import type { JobActivityItem } from '@pkg/schema/equipment';
import { isSameDay, isSameYear, subDays } from 'date-fns';

/** One calendar day of the feed, in the order the feed delivered it. */
export type JobActivityDayGroup = {
  /** The reader's local calendar day, `yyyy-MM-dd` — the group's identity and React key. */
  day: string;
  items: JobActivityItem[];
  label: string;
};

/**
 * Split the feed into day headings. The API already sorts by `occurredAt`, so a day is a consecutive
 * run rather than a bucket to collect: entries keep the order they arrived in, and a page boundary
 * landing mid-day extends that day's group instead of opening a second heading for it.
 */
export function groupJobActivityByDay(items: JobActivityItem[], now: Date = new Date()): JobActivityDayGroup[] {
  const groups: JobActivityDayGroup[] = [];

  for (const item of items) {
    const day = formatDate(item.occurredAt, 'yyyy-MM-dd');
    const openGroup = groups.at(-1);

    if (openGroup?.day === day) {
      openGroup.items.push(item);
      continue;
    }

    groups.push({ day, items: [item], label: formatJobActivityDayLabel(item.occurredAt, now) });
  }

  return groups;
}

/**
 * The heading over a day's entries. Today and Yesterday are named as well as dated: the weekday is
 * what places an entry in the reader's week, but the two most-read days should not have to be
 * counted back to. The year only appears once it is no longer the obvious one.
 */
export function formatJobActivityDayLabel(occurredAt: string, now: Date = new Date()): string {
  const date = parseDate(occurredAt);

  if (!date) {
    return '';
  }

  const dayLabel = formatDate(date, isSameYear(date, now) ? 'EEE d MMM' : 'EEE d MMM yyyy');

  if (isSameDay(date, now)) {
    return `Today · ${dayLabel}`;
  }

  if (isSameDay(date, subDays(now, 1))) {
    return `Yesterday · ${dayLabel}`;
  }

  return dayLabel;
}
