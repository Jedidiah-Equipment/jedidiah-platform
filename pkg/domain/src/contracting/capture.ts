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
 * Which rule refused a capture. Several share one wire code, so the copy keys off this. The two busy
 * rules are the stint constraints' refusals, which the database raises rather than `judgeCapture`.
 */
export type CaptureRule =
  | 'comment-required'
  | 'already-arrived'
  | 'not-on-site'
  | 'machine-busy'
  | 'implement-busy'
  | 'previous-changed'
  | 'below-latest';

export type CaptureRefused = { ok: false; reason: ReadingErrorCode; rule: CaptureRule };
/** `disputes` names the latest reading an accepted capture below it disputes. */
export type CaptureVerdict = { ok: true; disputes: string | null } | CaptureRefused;

const reasons: Record<CaptureRule, ReadingErrorCode> = {
  'comment-required': 'reading.invalid_role',
  'already-arrived': 'reading.invalid_role',
  'not-on-site': 'reading.invalid_role',
  'machine-busy': 'reading.machine_on_site',
  'implement-busy': 'reading.implement_on_site',
  'previous-changed': 'reading.previous_changed',
  'below-latest': 'reading.below_latest',
};

const refuse = (rule: CaptureRule): CaptureRefused => ({ ok: false, reason: reasons[rule], rule });

/** Whether this capture may land on the Machine's ledger as the server holds it under the lock. */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  if (capture.role === 'departure' && world.management && !world.hasPhoto && !capture.comment?.trim())
    return refuse('comment-required');
  if (capture.role === 'arrival' && world.stint !== null && world.stint !== 'planned') return refuse('already-arrived');
  if (capture.role === 'departure' && world.stint !== 'on-site') return refuse('not-on-site');
  if (
    capture.disputePrevious &&
    capture.expectedPreviousId !== undefined &&
    capture.expectedPreviousId !== (world.latest?.id ?? null)
  )
    return refuse('previous-changed');
  const below = world.latest !== null && capture.value < world.latest.value;
  if (below && !capture.disputePrevious) return refuse('below-latest');
  return { ok: true, disputes: below && world.latest ? world.latest.id : null };
}

/** The one sentence a refused capture shows: the server sends it and the phone displays it. */
export function captureRefusal(verdict: CaptureRefused): string {
  switch (verdict.rule) {
    case 'comment-required':
      return 'A reason is required for a photo-less departure reading.';
    case 'already-arrived':
      return 'This Machine Assignment already arrived.';
    case 'not-on-site':
      return 'This Machine Assignment is not on site.';
    case 'machine-busy':
      return 'This Machine is still on site on another Job — capture its departure there first.';
    case 'implement-busy':
      return 'This Implement is still on site on another Job — capture its departure there first.';
    case 'previous-changed':
      return 'Another reading landed first. Review the latest reading before resubmitting a dispute.';
    case 'below-latest':
      return 'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.';
  }
}

/** Read At is the Foreman's word for when the meter was read; only a time still to come is refused. */
export const FUTURE_READ_AT_REFUSAL = 'Read At cannot be in the future.';
