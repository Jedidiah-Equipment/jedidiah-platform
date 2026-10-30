import type { ReadAtSuggestion } from '@pkg/schema/contracting';

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

/**
 * When the meter was read, as every capture form holds it: Now, or Earlier… with the time picked by hand, a photo's
 * time, or the time the server proposed for a refused value. Earlier… with no time yet posts nothing until one is
 * picked. A proposal stays beside whatever time is picked until the value changes or Now is chosen, so the form keeps
 * saying which reports it came from.
 */
export type ReadAtChoice =
  | { kind: 'now' }
  | { kind: 'earlier'; at: null; proposal?: ReadAtSuggestion }
  | { kind: 'earlier'; at: Date; by: 'hand' | 'photo' | 'proposal'; proposal?: ReadAtSuggestion };

export const READ_AT_NOW: ReadAtChoice = { kind: 'now' };

/** The Read At a choice posts; null is now, and so is Earlier… while no time is picked. */
export const readAtOf = (choice: ReadAtChoice): Date | null => (choice.kind === 'earlier' ? choice.at : null);

/** Who set the time a choice posts; null while it posts now. */
const setBy = (choice: ReadAtChoice) => (choice.kind === 'earlier' && choice.at ? choice.by : null);

/** The proposal a choice holds, which the picker says the reports of. */
export const readAtProposal = (choice: ReadAtChoice): ReadAtSuggestion | null =>
  (choice.kind === 'earlier' && choice.proposal) || null;

const keepProposal = (choice: ReadAtChoice) => {
  const proposal = readAtProposal(choice);
  return proposal ? { proposal } : {};
};

/** Earlier… chosen with no time picked yet: the form holds Save until one is. */
export const readAtPending = (choice: ReadAtChoice): boolean => choice.kind === 'earlier' && choice.at === null;

/** Earlier… chosen: a time already set stays, otherwise none is picked yet. */
export const readAtEarlier = (choice: ReadAtChoice): ReadAtChoice =>
  choice.kind === 'earlier' ? choice : { kind: 'earlier', at: null };

/** A time the person picked, null while the picker names none; the instant already held, or proposed, keeps who set it. */
export function readAtPicked(choice: ReadAtChoice, at: Date | null): ReadAtChoice {
  if (at === null) return { kind: 'earlier', at: null, ...keepProposal(choice) };
  if (readAtOf(choice)?.getTime() === at.getTime()) return choice;
  const proposal = readAtProposal(choice);
  const proposed = proposal !== null && new Date(proposal.readAt).getTime() === at.getTime();
  return { kind: 'earlier', at, by: proposed ? 'proposal' : 'hand', ...keepProposal(choice) };
}

/** A photo's EXIF time replaces Read At; without one a photo-set Read At returns to now and any other stays. */
export const readAtAfterPhoto = (choice: ReadAtChoice, takenAt: Date | null): ReadAtChoice =>
  takenAt
    ? { kind: 'earlier', at: takenAt, by: 'photo', ...keepProposal(choice) }
    : setBy(choice) === 'photo'
      ? READ_AT_NOW
      : choice;

/** A refusal that proposes a Read At flips the choice to Earlier… with it; nothing is saved until the next Save. */
export const readAtAfterRefusal = (
  choice: ReadAtChoice,
  proposal: ReadAtSuggestion | null | undefined,
): ReadAtChoice => (proposal ? { kind: 'earlier', at: new Date(proposal.readAt), by: 'proposal', proposal } : choice);

/** A proposal belongs to the value refused: typing a new value drops it and keeps its time as the person's own. */
export function readAtAfterValueEdit(choice: ReadAtChoice): ReadAtChoice {
  if (choice.kind !== 'earlier' || !choice.proposal) return choice;
  return choice.at
    ? { kind: 'earlier', at: choice.at, by: choice.by === 'photo' ? 'photo' : 'hand' }
    : { kind: 'earlier', at: null };
}

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

/**
 * A minute picker's value picked over the choice: while it shows the minute of the time held, or of the proposal, that
 * instant keeps its seconds.
 */
export function readAtPickedFromPicker(choice: ReadAtChoice, value: string): ReadAtChoice {
  const proposal = readAtProposal(choice);
  const proposed = proposal ? new Date(proposal.readAt) : null;
  const held = proposed && value === readAtInputValue(proposed) ? proposed : readAtOf(choice);
  return readAtPicked(choice, readAtFromPicker(value, held));
}
