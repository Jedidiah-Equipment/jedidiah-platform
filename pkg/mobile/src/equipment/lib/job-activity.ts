import { formatDate, parseDate } from '@pkg/domain';
import type { JobActivityItem } from '@pkg/schema/equipment';

export type JobActivityDaySection = {
  data: JobActivityItem[];
  day: string;
  label: string;
};

/** Keeps the API's newest-first order while splitting the feed into local calendar days. */
export function groupJobActivityByDay(items: JobActivityItem[], now: Date = new Date()): JobActivityDaySection[] {
  const sections: JobActivityDaySection[] = [];

  for (const item of items) {
    const day = formatDate(item.occurredAt, 'yyyy-MM-dd');
    const openSection = sections.at(-1);

    if (openSection?.day === day) {
      openSection.data.push(item);
      continue;
    }

    sections.push({ data: [item], day, label: formatJobActivityDayLabel(item.occurredAt, now) });
  }

  return sections;
}

export function formatJobActivityDayLabel(occurredAt: string, now: Date = new Date()): string {
  const date = parseDate(occurredAt);

  if (!date) return '';

  const dateKey = formatDate(date, 'yyyy-MM-dd');
  const todayKey = formatDate(now, 'yyyy-MM-dd');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDate(yesterday, 'yyyy-MM-dd');
  const dateLabel = formatDate(date, date.getFullYear() === now.getFullYear() ? 'EEE d MMM' : 'EEE d MMM yyyy');

  if (dateKey === todayKey) return `Today · ${dateLabel}`;
  if (dateKey === yesterdayKey) return `Yesterday · ${dateLabel}`;

  return dateLabel;
}
