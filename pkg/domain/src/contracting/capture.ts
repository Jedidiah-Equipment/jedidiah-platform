import {
  type AssignmentState,
  type JobActionBlockedReason,
  type JobActionVerdict,
  type ReadingCaptureInput,
  type ReadingErrorCode,
  type ReadingRole,
  ReadingValue,
} from '@pkg/schema/contracting';
import { assignmentActionRefusal, assignmentStateAllows } from './assignment-actions.js';

/**
 * What an Hour Reading capture is judged against: the server's rows under the Machine lock, gathered by core as
 * facts. Outside this table, and enforced elsewhere: a replayed capture id, a Machine or Assignment that does not
 * exist, and the two busy rules, which the database's unique constraints raise after the write.
 */
export type CaptureWorld = {
  /** The Machine's latest reading, or null while its ledger is empty. */
  latest: { id: string; value: number } | null;
  /** The stint the capture lands on; null for a spot or baseline reading. */
  stint: AssignmentState | null;
  /** The Job's own verdict on `capture`; null when there is no stint. */
  jobVerdict: JobActionVerdict | null;
  /** Contracting management, whose photo-less departures must say why. */
  management: boolean;
  /** May capture a Baseline Reading. */
  mayBaseline: boolean;
  machineRetired: boolean;
  /** An arrival's Implement as the stint plus overrides resolve it; true when none is named. */
  implementValid: boolean;
  /** An arrival's Driver as the stint plus overrides resolve them; true when none is named. */
  driverValid: boolean;
  hasPhoto: boolean;
  now: Date;
  /** Phone clocks drift; the server passes FUTURE_READ_AT_TOLERANCE_MS. */
  futureToleranceMs: number;
};

export type CaptureAttempt = {
  role: ReadingRole;
  value: number;
  readAt: Date;
  disputePrevious: boolean;
  /** The reading the capturer believes is latest; a dispute must name the one that actually is. */
  expectedPreviousId: string | null | undefined;
  comment: string | null;
};

/** Every way `judgeCapture` refuses a capture, in the order it judges them. */
export type CaptureRule =
  | 'baseline-forbidden'
  | 'future-read-at'
  | 'retired-machine'
  | 'job-refused'
  | 'implement-invalid'
  | 'driver-invalid'
  | 'comment-required'
  | 'already-arrived'
  | 'not-on-site'
  | 'previous-changed'
  | 'below-latest'
  | 'baseline-exists';

/** The stint constraints' refusals: the database raises these after the write, so the table cannot judge them. */
export type CaptureConstraintRule = 'machine-busy' | 'implement-busy';

/** The wire code and the one sentence of each refusal; a Job refusal brings its own. */
export const captureRefusals: Record<
  Exclude<CaptureRule, 'job-refused'> | CaptureConstraintRule,
  { code: ReadingErrorCode; message: string }
> = {
  'baseline-forbidden': {
    code: 'reading.forbidden',
    message: 'Only a Contracting administrator can capture a Baseline Reading.',
  },
  'future-read-at': { code: 'reading.future_read_at', message: 'Read At cannot be in the future.' },
  'retired-machine': { code: 'reading.retired_machine', message: 'Cannot capture readings for a retired Machine.' },
  'implement-invalid': { code: 'reading.invalid_role', message: 'The selected Implement is no longer available.' },
  'driver-invalid': { code: 'reading.invalid_role', message: 'Select a person with the Contracting driver role.' },
  'comment-required': {
    code: 'reading.invalid_role',
    message: 'A reason is required for a photo-less departure reading.',
  },
  'already-arrived': { code: 'reading.invalid_role', message: assignmentActionRefusal('captureArrival') },
  'not-on-site': { code: 'reading.invalid_role', message: assignmentActionRefusal('captureDeparture') },
  'previous-changed': {
    code: 'reading.previous_changed',
    message: 'Another reading landed first. Review the latest reading before resubmitting a dispute.',
  },
  'below-latest': {
    code: 'reading.below_latest',
    message: 'Reading is below the latest reading. Retake it or assert that the previous reading is wrong.',
  },
  'baseline-exists': { code: 'reading.baseline_exists', message: 'A Baseline Reading must be the first reading.' },
  'machine-busy': {
    code: 'reading.machine_on_site',
    message: 'This Machine is still on site on another Job — capture its departure there first.',
  },
  'implement-busy': {
    code: 'reading.implement_on_site',
    message: 'This Implement is still on site on another Job — capture its departure there first.',
  },
};

export type CaptureRefused = {
  ok: false;
  rule: CaptureRule;
  reason: ReadingErrorCode;
  message: string;
  /** Set when the Job refused: the Job Action and its reason, as the server's refusal metadata carries them. */
  refused?: { action: 'capture'; reason: JobActionBlockedReason };
};
/** `disputes` names the latest reading an accepted capture below it disputes. */
export type CaptureVerdict = { ok: true; disputes: string | null } | CaptureRefused;

const refuse = (rule: Exclude<CaptureRule, 'job-refused'>): CaptureRefused => ({
  ok: false,
  rule,
  reason: captureRefusals[rule].code,
  message: captureRefusals[rule].message,
});

/** A Job refusal in Reading terms: a permission or ownership refusal is forbidden, a status refusal wrong status. */
export const readingCodeForJobRefusal = (
  reason: JobActionBlockedReason,
): 'reading.forbidden' | 'reading.wrong_status' =>
  reason === 'no-permission' || reason === 'not-your-job' ? 'reading.forbidden' : 'reading.wrong_status';

const refuseJob = (verdict: Extract<JobActionVerdict, { allowed: false }>): CaptureRefused => ({
  ok: false,
  rule: 'job-refused',
  reason: readingCodeForJobRefusal(verdict.reason),
  message: verdict.message,
  refused: { action: 'capture', reason: verdict.reason },
});

/** A capture below the Machine's latest reading lands only as a dispute. */
export const captureIsBelowLatest = (value: number, latest: { value: number } | null | undefined): boolean =>
  !!latest && value < latest.value;

/** Whoever works every Job must say why a departure has no photo. */
export const captureNeedsComment = (role: ReadingRole, world: Pick<CaptureWorld, 'management' | 'hasPhoto'>): boolean =>
  role === 'departure' && world.management && !world.hasPhoto;

/** Phone clocks drift; a Read At this far ahead of the server is still the Foreman's "now". */
export const FUTURE_READ_AT_TOLERANCE_MS = 5 * 60_000;

/** Whether a Read At is still to come. The server passes the tolerance; the phone, judging its own clock, none. */
export const isFutureReadAt = (readAt: Date, now = new Date(), toleranceMs = 0) =>
  readAt.getTime() > now.getTime() + toleranceMs;

/** Whether this capture may land on the Machine's ledger as the server holds it under the lock. */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  if (capture.role === 'baseline' && !world.mayBaseline) return refuse('baseline-forbidden');
  if (isFutureReadAt(capture.readAt, world.now, world.futureToleranceMs)) return refuse('future-read-at');
  if (world.machineRetired) return refuse('retired-machine');
  if (world.jobVerdict && !world.jobVerdict.allowed) return refuseJob(world.jobVerdict);
  if (!world.implementValid) return refuse('implement-invalid');
  if (!world.driverValid) return refuse('driver-invalid');
  if (captureNeedsComment(capture.role, world) && !capture.comment?.trim()) return refuse('comment-required');
  // A null stint is a Machine arriving on a Job it was never planned on, which is still an arrival.
  if (capture.role === 'arrival' && world.stint !== null && !assignmentStateAllows('captureArrival', world.stint))
    return refuse('already-arrived');
  if (capture.role === 'departure' && (world.stint === null || !assignmentStateAllows('captureDeparture', world.stint)))
    return refuse('not-on-site');
  if (
    capture.disputePrevious &&
    capture.expectedPreviousId !== undefined &&
    capture.expectedPreviousId !== (world.latest?.id ?? null)
  )
    return refuse('previous-changed');
  const below = captureIsBelowLatest(capture.value, world.latest);
  if (below && !capture.disputePrevious) return refuse('below-latest');
  if (capture.role === 'baseline' && world.latest) return refuse('baseline-exists');
  return { ok: true, disputes: below && world.latest ? world.latest.id : null };
}

/** What a capture form knows: the served latest (undefined while it loads), who is capturing, and the photo. */
export type CaptureFormWorld = {
  latest: { id: string; value: number } | null | undefined;
  management: boolean;
  hasPhoto: boolean;
  now: Date;
};

export type CaptureDraft = {
  role: Exclude<ReadingRole, 'baseline'>;
  /** The value as typed. */
  value: string;
  /** The reading the person said is wrong, or null. */
  disputedReadingId: string | null;
  comment: string;
  /** Null is "now". */
  readAt: Date | null;
  stintOverrides: ReadingCaptureInput['stintOverrides'];
};

/** The request fields a form posts; the client adds where it lands and when. */
export type CaptureRequest = Pick<
  ReadingCaptureInput,
  'role' | 'value' | 'comment' | 'disputePrevious' | 'expectedPreviousId' | 'stintOverrides'
>;

export type CaptureFormVerdict = {
  parsed: number | null;
  below: boolean;
  disputeConfirmed: boolean;
  commentRequired: boolean;
  futureReadAt: boolean;
  /** Null until the draft would pass every rule the form can judge; then the request the client posts. */
  request: CaptureRequest | null;
};

/**
 * The form's half of the table: what a capture form can already refuse before posting, and the request it posts
 * when it cannot. Client-only affordances (a camera open, options loading) stay with each client.
 */
export function deriveCaptureForm(world: CaptureFormWorld, draft: CaptureDraft): CaptureFormVerdict {
  const value = draft.value.trim() ? ReadingValue.safeParse(Number(draft.value.replace(',', '.'))) : null;
  const parsed = value?.success ? value.data : null;
  const latest = world.latest ?? null;
  const below = parsed !== null && captureIsBelowLatest(parsed, latest);
  const disputeConfirmed = below && draft.disputedReadingId === latest?.id;
  const commentRequired = captureNeedsComment(draft.role, world);
  const futureReadAt = draft.readAt !== null && isFutureReadAt(draft.readAt, world.now);
  const passes =
    parsed !== null && (!below || disputeConfirmed) && !(commentRequired && !draft.comment.trim()) && !futureReadAt;
  return {
    parsed,
    below,
    disputeConfirmed,
    commentRequired,
    futureReadAt,
    request:
      passes && parsed !== null
        ? {
            role: draft.role,
            value: parsed,
            comment: draft.comment.trim() || null,
            disputePrevious: disputeConfirmed,
            // Name the latest only once it is known; the server then refuses a capture judged against an older one.
            ...(world.latest !== undefined ? { expectedPreviousId: latest?.id ?? null } : {}),
            ...(draft.stintOverrides ? { stintOverrides: draft.stintOverrides } : {}),
          }
        : null,
  };
}
