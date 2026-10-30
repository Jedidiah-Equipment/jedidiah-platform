const BACKDATED_AFTER_MS = 5 * 60_000;

/** Phone clocks drift; a Read At this far ahead of the server is still the Foreman's "now". */
export const FUTURE_READ_AT_TOLERANCE_MS = 5 * 60_000;

export const FUTURE_READ_AT_REFUSAL = 'Read At cannot be in the future.';

/** Whether a Read At is still to come. The server passes the tolerance; the phone, judging its own clock, none. */
export const isFutureReadAt = (readAt: Date, now = new Date(), toleranceMs = 0) =>
  readAt.getTime() > now.getTime() + toleranceMs;

/** Read At set more than five minutes before the attempt: the `backdated` flag on `reading captured`. */
export const isBackdated = (readAt: Date | null, attemptedAt: Date) =>
  readAt !== null && attemptedAt.getTime() - readAt.getTime() > BACKDATED_AFTER_MS;

export const capturedAtFor = (readAt: Date | null, attemptedAt: Date) => (readAt ?? attemptedAt).toISOString();

/** A Read At as a `datetime-local` input holds it: the browser's local wall time as 'YYYY-MM-DDTHH:mm'. */
export const readAtInputValue = (date: Date) => {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** The Read At a `datetime-local` value names, read as local time; blank or unreadable is null. */
export function readAtFromInput(value: string): Date | null {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/**
 * The Read At a minute picker names: the held instant while the picker still shows its minute, so seconds the picker
 * cannot show survive an untouched field, else the picked minute.
 */
export const readAtFromPicker = (value: string, held: Date | null): Date | null =>
  held && value === readAtInputValue(held) ? held : readAtFromInput(value);
