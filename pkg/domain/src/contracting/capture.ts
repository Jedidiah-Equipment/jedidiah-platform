import type { AssignmentState, ReadingErrorCode, ReadingRole } from '@pkg/schema/contracting';

/** What an Hour Reading capture is judged against: the server's rows under the Machine lock. */
export type CaptureWorld = {
  /** The Machine's latest reading, or null while its ledger is empty. */
  latest: { id: string; value: number } | null;
  /** The stint the capture lands on; null for a spot or baseline reading. */
  stint: AssignmentState | null;
  /** Contracting management, whose photo-less departures must say why. */
  management: boolean;
  hasPhoto: boolean;
};

export type CaptureAttempt = {
  role: ReadingRole;
  value: number;
  disputePrevious: boolean;
  /** The reading the capturer believes is latest; a dispute must name the one that actually is. */
  expectedPreviousId: string | null | undefined;
  comment: string | null;
};

/**
 * Every way a capture is refused. `judgeCapture` returns the first five; the two busy rules are the stint
 * constraints' refusals, which the database raises; a Read At still to come is refused before the ledger is read.
 */
export type CaptureRule =
  | 'comment-required'
  | 'already-arrived'
  | 'not-on-site'
  | 'previous-changed'
  | 'below-latest'
  | 'machine-busy'
  | 'implement-busy'
  | 'future-read-at';

/** The wire code and the one sentence of each refusal: the server sends it and the phone displays it. */
export const captureRefusals: Record<CaptureRule, { code: ReadingErrorCode; message: string }> = {
  'comment-required': {
    code: 'reading.invalid_role',
    message: 'A reason is required for a photo-less departure reading.',
  },
  'already-arrived': { code: 'reading.invalid_role', message: 'This Machine Assignment already arrived.' },
  'not-on-site': { code: 'reading.invalid_role', message: 'This Machine Assignment is not on site.' },
  'previous-changed': {
    code: 'reading.previous_changed',
    message: 'Another reading landed first. Review the latest reading before resubmitting a dispute.',
  },
  'below-latest': {
    code: 'reading.below_latest',
    message: 'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
  },
  'machine-busy': {
    code: 'reading.machine_on_site',
    message: 'This Machine is still on site on another Job — capture its departure there first.',
  },
  'implement-busy': {
    code: 'reading.implement_on_site',
    message: 'This Implement is still on site on another Job — capture its departure there first.',
  },
  'future-read-at': { code: 'reading.future_read_at', message: 'Read At cannot be in the future.' },
};

export type CaptureRefused = { ok: false; reason: ReadingErrorCode; message: string };
/** `disputes` names the latest reading an accepted capture below it disputes. */
export type CaptureVerdict = { ok: true; disputes: string | null } | CaptureRefused;

const refuse = (rule: CaptureRule): CaptureRefused => ({
  ok: false,
  reason: captureRefusals[rule].code,
  message: captureRefusals[rule].message,
});

/** A capture below the Machine's latest reading lands only as a dispute. */
export const captureIsBelowLatest = (value: number, latest: { value: number } | null | undefined): boolean =>
  !!latest && value < latest.value;

/** Whoever works every Job must say why a departure has no photo. */
export const captureNeedsComment = (role: ReadingRole, world: Pick<CaptureWorld, 'management' | 'hasPhoto'>): boolean =>
  role === 'departure' && world.management && !world.hasPhoto;

/** Whether this capture may land on the Machine's ledger as the server holds it under the lock. */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  if (captureNeedsComment(capture.role, world) && !capture.comment?.trim()) return refuse('comment-required');
  if (capture.role === 'arrival' && world.stint !== null && world.stint !== 'planned') return refuse('already-arrived');
  if (capture.role === 'departure' && world.stint !== 'on-site') return refuse('not-on-site');
  if (
    capture.disputePrevious &&
    capture.expectedPreviousId !== undefined &&
    capture.expectedPreviousId !== (world.latest?.id ?? null)
  )
    return refuse('previous-changed');
  const below = captureIsBelowLatest(capture.value, world.latest);
  if (below && !capture.disputePrevious) return refuse('below-latest');
  return { ok: true, disputes: below && world.latest ? world.latest.id : null };
}

/** Phone clocks drift; a Read At this far ahead of the server is still the Foreman's "now". */
export const FUTURE_READ_AT_TOLERANCE_MS = 5 * 60_000;

/** Whether a Read At is still to come. The server passes the tolerance; the phone, judging its own clock, none. */
export const isFutureReadAt = (readAt: Date, now = new Date(), toleranceMs = 0) =>
  readAt.getTime() > now.getTime() + toleranceMs;
