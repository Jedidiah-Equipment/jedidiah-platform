import {
  type AssignmentState,
  type JobActionBlockedReason,
  type JobActionVerdict,
  type ReadingCaptureInput,
  type ReadingErrorCode,
  type ReadingRole,
  ReadingValue,
  type readingMethods,
} from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { assignmentActionRefusal, assignmentStateAllows } from './assignment-actions.js';
import { serviceDueSoonCrossed } from './service-due.js';

/** A reading either side of a capture's Read At. `telematics` is a reading the Machine itself reported. */
export type CaptureNeighbour = {
  id: string;
  role: ReadingRole;
  value: number;
  capturedAt: Date;
  method: (typeof readingMethods)[number] | 'telematics';
};

/**
 * What an Hour Reading capture is judged against: the server's rows under the Machine lock, gathered by core as
 * facts. Outside this table, and enforced elsewhere: a replayed capture id, a Machine or Assignment that does not
 * exist, and the two busy rules, which the database's unique constraints raise after the write.
 */
export type CaptureWorld = {
  /** The Machine's latest reading by Read At, or null while its ledger is empty. */
  latest: { id: string; value: number } | null;
  /** The nearest reading at or before the capture's Read At (ties by the latest accepted), or null. */
  previous: CaptureNeighbour | null;
  /** The nearest reading after the capture's Read At (ties by the first accepted), or null. */
  next: CaptureNeighbour | null;
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
  | 'above-next'
  | 'contradicts-telematics'
  | 'below-previous'
  | 'below-latest'
  | 'baseline-exists';

/** The refusals whose sentence names the neighbour the capture falls outside. */
type NeighbourRule = 'above-next' | 'contradicts-telematics' | 'below-previous';

/** The stint constraints' refusals: the database raises these after the write, so the table cannot judge them. */
export type CaptureConstraintRule = 'machine-busy' | 'implement-busy';

/** The wire code and the one sentence of each refusal; a Job refusal brings its own. */
export const captureRefusals: Record<
  Exclude<CaptureRule, 'job-refused' | NeighbourRule> | CaptureConstraintRule,
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

const refuse = (rule: Exclude<CaptureRule, 'job-refused' | NeighbourRule>): CaptureRefused => ({
  ok: false,
  rule,
  reason: captureRefusals[rule].code,
  message: captureRefusals[rule].message,
});

/** A refusal against a neighbour, naming its value and Read At; the fix is the capture's time or its value. */
const refuseAgainst = (rule: NeighbourRule, neighbour: CaptureNeighbour): CaptureRefused => {
  const reading = `${formatHours(neighbour.value)} at ${formatDate(neighbour.capturedAt, 'medium')}`;
  const said =
    neighbour.method === 'telematics'
      ? `John Deere reported ${reading}.`
      : rule === 'above-next'
        ? `A later reading of ${reading} is lower.`
        : `A reading of ${reading} is higher.`;
  return {
    ok: false,
    rule,
    reason: rule === 'above-next' ? 'reading.above_next' : 'reading.below_latest',
    message: `${said} Check the time or the value.`,
  };
};

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
  const { previous, next } = world;
  if (next && capture.value > next.value) return refuseAgainst('above-next', next);
  if (previous && capture.value < previous.value) {
    if (previous.method === 'telematics') return refuseAgainst('contradicts-telematics', previous);
    if (previous.id !== world.latest?.id) return refuseAgainst('below-previous', previous);
  }
  // Only a capture that becomes the latest is judged against it; one dated behind it answers to its neighbours.
  const below = next === null && captureIsBelowLatest(capture.value, world.latest);
  if (below && !capture.disputePrevious) return refuse('below-latest');
  const beforeBaseline = previous === null && next?.role === 'baseline';
  if (capture.role === 'baseline' ? world.latest : beforeBaseline) return refuse('baseline-exists');
  return { ok: true, disputes: below && world.latest ? world.latest.id : null };
}

/**
 * Service Due Soon is crossed only by a capture that becomes the Machine's latest reading: one dated behind the latest
 * never crosses it.
 */
export const captureCrossesServiceDueSoon = (
  world: Pick<CaptureWorld, 'latest' | 'next'>,
  service: { newHours: number; nextServiceDueHours: number | null; threshold: number },
) => world.next === null && serviceDueSoonCrossed({ previousHours: world.latest?.value ?? null, ...service });

/** What a capture form knows: the served latest (undefined while it loads), who is capturing, and the photo. */
export type CaptureFormWorld = {
  latest: { id: string; value: number; capturedAt: string } | null | undefined;
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

/** A reading as typed, read as hours; null until it is a valid reading. A comma counts as the decimal point. */
export function parseCaptureValue(typed: string): number | null {
  const value = typed.trim() ? ReadingValue.safeParse(Number(typed.replace(',', '.'))) : null;
  return value?.success ? value.data : null;
}

/**
 * The value half of a capture form: whether it is below the latest, and whether that dispute is confirmed. A Read At
 * before the latest's is never judged here: only the server knows its neighbours, so the form posts and shows its
 * sentence.
 */
export function captureValueVerdict(
  latest: CaptureFormWorld['latest'],
  parsed: number | null,
  disputedReadingId: string | null,
  readAt: Date | null,
) {
  const backdated = !!latest && readAt !== null && readAt.getTime() < Date.parse(latest.capturedAt);
  const below = parsed !== null && !backdated && captureIsBelowLatest(parsed, latest ?? null);
  return { below, disputeConfirmed: below && disputedReadingId === latest?.id };
}

/**
 * The form's half of the table: what a capture form can already refuse before posting, and the request it posts
 * when it cannot. Client-only affordances (a camera open, options loading) stay with each client.
 */
export function deriveCaptureForm(world: CaptureFormWorld, draft: CaptureDraft): CaptureFormVerdict {
  const parsed = parseCaptureValue(draft.value);
  const latest = world.latest ?? null;
  const { below, disputeConfirmed } = captureValueVerdict(latest, parsed, draft.disputedReadingId, draft.readAt);
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
