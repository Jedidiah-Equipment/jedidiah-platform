const BACKDATED_AFTER_MS = 5 * 60_000;

/** Phone clocks drift; a Read At this far ahead of the server is still the Foreman's "now". */
export const FUTURE_READ_AT_TOLERANCE_MS = 5 * 60_000;

export const FUTURE_READ_AT_REFUSAL = 'Read At cannot be in the future.';

/** Whether a Read At is still to come. The server passes the tolerance; the phone, judging its own clock, none. */
export const isFutureReadAt = (readAt: Date, now = new Date(), toleranceMs = 0) =>
  readAt.getTime() > now.getTime() + toleranceMs;

/** EXIF DateTimeOriginal is 'YYYY:MM:DD HH:MM:SS' with no zone: read it as the phone's local time. */
export function parseExifDateTime(exif: Record<string, unknown> | null | undefined, now = new Date()): Date | null {
  const raw = exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime;
  const match = typeof raw === 'string' ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(raw) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) || date > now ? null : date;
}

/** Read At set more than five minutes before the attempt: the `backdated` flag on `reading captured`. */
export const isBackdated = (readAt: Date | null, attemptedAt: Date) =>
  readAt !== null && attemptedAt.getTime() - readAt.getTime() > BACKDATED_AFTER_MS;

export const capturedAtFor = (readAt: Date | null, attemptedAt: Date) => (readAt ?? attemptedAt).toISOString();

/** Read At as the capture form holds it; null is "now". `by` says who set it. */
export type ReadAtChoice = { at: Date; by: 'hand' | 'photo' };

/** A photo's EXIF time replaces Read At; without one a hand-set Read At stays and a photo-set one returns to now. */
export const readAtAfterPhoto = (current: ReadAtChoice | null, takenAt: Date | null): ReadAtChoice | null =>
  takenAt ? { at: takenAt, by: 'photo' } : current?.by === 'hand' ? current : null;

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
