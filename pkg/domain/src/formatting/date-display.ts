import { differenceInSeconds, isAfter, isSameDay, isWithinInterval, subDays, subWeeks } from 'date-fns';

import { type DateFormat, formatDate, formatRelativeTime, parseDate } from './date.js';

export type DateDisplayParts = {
  label: string;
  tooltip: string | null;
};

const SECONDS_PER_DAY = 24 * 60 * 60;

/**
 * How a timestamp reads in a list: `Today at 14:05`, `Yesterday at 14:05`, a relative duration within
 * the last week, and the requested format beyond that. The recent forms carry the exact `medium`
 * timestamp as a tooltip; future dates always use the requested format.
 */
export function getDateDisplayParts({
  date,
  emptyValue,
  format = 'short',
  now = new Date(),
}: {
  date?: Date | string | number | null | undefined;
  emptyValue?: string | undefined;
  format?: DateFormat;
  now?: Date;
}): DateDisplayParts {
  const parsedDate = parseDate(date);

  if (!parsedDate) {
    return { label: emptyValue ?? '', tooltip: null };
  }

  if (isAfter(parsedDate, now)) {
    return { label: formatDate(parsedDate, format, emptyValue), tooltip: null };
  }

  const tooltip = formatDate(parsedDate, 'medium');

  if (isSameDay(parsedDate, now)) {
    return { label: `Today at ${formatDate(parsedDate, 'time')}`, tooltip };
  }

  const secondsAgo = differenceInSeconds(now, parsedDate, { roundingMethod: 'floor' });
  // The duration floors whole days, so anything from one full day up to but not including two full
  // days would otherwise render as "1 day ago".
  const wouldRenderAsOneDayAgo = secondsAgo >= SECONDS_PER_DAY && secondsAgo < 2 * SECONDS_PER_DAY;
  if (isSameDay(parsedDate, subDays(now, 1)) || wouldRenderAsOneDayAgo) {
    return { label: `Yesterday at ${formatDate(parsedDate, 'time')}`, tooltip };
  }

  if (isWithinInterval(parsedDate, { end: now, start: subWeeks(now, 1) })) {
    return { label: formatRelativeTime(parsedDate, now), tooltip };
  }

  return { label: formatDate(parsedDate, format, emptyValue), tooltip: null };
}
