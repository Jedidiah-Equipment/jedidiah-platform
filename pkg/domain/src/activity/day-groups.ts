import { DateIso, DateOnlyIso } from '@pkg/schema';
import { formatDayHeading, parseDate } from '../formatting/date.js';

/** One calendar day of a feed, in the order the feed delivered it. */
export type ActivityDayGroup<TItem> = {
  /** The reader's local calendar day, `yyyy-MM-dd` — the group's identity and React key. */
  day: DateOnlyIso;
  items: TItem[];
  label: string;
};

/**
 * Split a feed into day headings. The API already sorts by `occurredAt`, so a day is a consecutive
 * run rather than a bucket to collect: entries keep the order they arrived in, and a page boundary
 * landing mid-day extends that day's group instead of opening a second heading for it.
 */
export function groupActivityByDay<TItem extends { occurredAt: DateIso }>(
  items: readonly TItem[],
  now: DateIso = DateIso.parse(new Date()),
): ActivityDayGroup<TItem>[] {
  const groups: ActivityDayGroup<TItem>[] = [];

  for (const item of items) {
    const day = DateOnlyIso.parse(parseDate(item.occurredAt));
    const openGroup = groups.at(-1);

    if (openGroup?.day === day) {
      openGroup.items.push(item);
      continue;
    }

    groups.push({ day, items: [item], label: formatActivityDayLabel(item.occurredAt, now) });
  }

  return groups;
}

function formatActivityDayLabel(occurredAt: DateIso, now: DateIso): string {
  const date = parseDate(occurredAt);
  const nowDate = parseDate(now);

  return date && nowDate ? formatDayHeading(date, nowDate) : '';
}
