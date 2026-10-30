import {
  type AssignmentState,
  type JobActionBlockedReason,
  type JobActionVerdict,
  type ReadingCaptureInput,
  type ReadingErrorCode,
  type ReadingRole,
  ReadingValue,
  type TelematicsProvider,
} from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { assignmentActionRefusal, assignmentStateAllows } from './assignment-actions.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import { outrunsClock, outrunsClockSentence, type TimedValue, telematicsProviderLabels } from './readings.js';
import { serviceDueSoonCrossed } from './service-due.js';

/** A reading either side of a capture's Read At; `telematicsProvider` names who reported a Telematics Reading. */
export type CaptureNeighbour = {
  id: string;
  role: ReadingRole;
  value: number;
  capturedAt: Date;
  telematicsProvider: TelematicsProvider | null;
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
  /** The nearest Telematics Reading at or before the capture's Read At: the capture answers to it however many captured readings stand between. */
  previousTelematics: CaptureNeighbour | null;
  /** The nearest Telematics Reading after the capture's Read At. */
  nextTelematics: CaptureNeighbour | null;
  /**
   * The Telematics Readings the capture's value falls between, whatever its Read At. Only a refusal that
   * `proposesReadAt` reads it, so core gathers it only for one.
   */
  valueBracket: ValueBracket;
  /** The stint the capture lands on; null for a spot or baseline reading. */
  stint: AssignmentState | null;
  /** A departure's stint arrival Read At; null otherwise. */
  stintArrivedAt: Date | null;
  /** The Machine's latest departure Read At, or null. */
  lastDepartedAt: Date | null;
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
  | 'departs-before-arrival'
  | 'arrives-before-departure'
  | 'previous-changed'
  | 'above-next'
  | 'contradicts-telematics'
  | 'below-previous'
  | 'outruns-clock'
  | 'below-latest'
  | 'baseline-exists';

/** The refusals whose sentence names the neighbour the capture falls outside. */
type NeighbourRule = 'above-next' | 'contradicts-telematics' | 'below-previous';

/** The refusals that bring their own sentence. */
type SentencedRule = 'job-refused' | 'outruns-clock' | NeighbourRule;

/** The stint constraints' refusals: the database raises these after the write, so the table cannot judge them. */
export type CaptureConstraintRule = 'machine-busy' | 'implement-busy';

/** The wire code and the one sentence of each refusal; a Job refusal brings its own. */
export const captureRefusals: Record<
  Exclude<CaptureRule, SentencedRule> | CaptureConstraintRule,
  { code: ReadingErrorCode; message: string }
> = {
  'baseline-forbidden': {
    code: 'reading.forbidden',
    message: 'Only a Contracting administrator can capture a Baseline Reading.',
  },
  'future-read-at': { code: 'reading.future_read_at', message: FUTURE_READ_AT_REFUSAL },
  'retired-machine': { code: 'reading.retired_machine', message: 'Cannot capture readings for a retired Machine.' },
  'implement-invalid': { code: 'reading.invalid_role', message: 'The selected Implement is no longer available.' },
  'driver-invalid': { code: 'reading.invalid_role', message: 'Select a person with the Contracting driver role.' },
  'comment-required': {
    code: 'reading.invalid_role',
    message: 'A reason is required for a photo-less departure reading.',
  },
  'already-arrived': { code: 'reading.invalid_role', message: assignmentActionRefusal('captureArrival') },
  'not-on-site': { code: 'reading.invalid_role', message: assignmentActionRefusal('captureDeparture') },
  'departs-before-arrival': {
    code: 'reading.invalid_role',
    message: 'A departure cannot be read before its arrival. Check the time.',
  },
  'arrives-before-departure': {
    code: 'reading.invalid_role',
    message: "An arrival cannot be read before the Machine's last departure. Check the time.",
  },
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
  /** Set on a value refusal John Deere brackets: when the meter most likely showed the value. */
  suggestedReadAt?: ReadAtSuggestion;
};
/** `disputes` names the latest reading an accepted capture below it disputes. */
export type CaptureVerdict = { ok: true; disputes: string | null } | CaptureRefused;

const refuse = (rule: Exclude<CaptureRule, SentencedRule>): CaptureRefused => ({
  ok: false,
  rule,
  reason: captureRefusals[rule].code,
  message: captureRefusals[rule].message,
});

/** A refusal against a neighbour, naming its value and Read At; the fix is the capture's time or its value. */
const refuseAgainst = (rule: NeighbourRule, neighbour: CaptureNeighbour): CaptureRefused => {
  const reading = `${formatHours(neighbour.value)} at ${formatDate(neighbour.capturedAt, 'medium')}`;
  const said = neighbour.telematicsProvider
    ? `${telematicsProviderLabels[neighbour.telematicsProvider]} reported ${reading}.`
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

/** Named after the neighbour it outruns; the fix is a Read At, on this reading or on that one from its Job. */
const refuseOutrunsClock = (
  earlier: TimedValue,
  later: TimedValue,
  neighbour: CaptureNeighbour,
  side: 'since' | 'before',
): CaptureRefused => ({
  ok: false,
  rule: 'outruns-clock',
  reason: 'reading.outruns_clock',
  message: `${outrunsClockSentence(earlier, later, neighbour, side)} Check Read At on this reading, or correct that reading's Read At from its Job.`,
});

/**
 * The Telematics Readings a value falls between: the last reported at or below it, at its Read At, and the first
 * reported above it, at the time it was first reported (a report's Read At moves on while its value stands).
 */
export type ValueBracket = { floor: CaptureNeighbour | null; ceiling: CaptureNeighbour | null };

export const NO_VALUE_BRACKET: ValueBracket = { floor: null, ceiling: null };

export type ReadAtSuggestion = {
  readAt: Date;
  /** The report the value matched, or the two it fell between, so the form can say so. */
  floor: CaptureNeighbour;
  ceiling: CaptureNeighbour | null;
};

/**
 * When John Deere says a value was on the meter: the floor's Read At when the value matches it (a Telematics Reading's
 * Read At is the last time that value was reported), otherwise the moment between the bracketing reports at which
 * hours would have reached it, which inside an hourly poll is near exact. Null when no Telematics Reading brackets
 * the value, or when the moment would break the stint's time order anyway.
 */
export function suggestReadAt(value: number, bracket: ValueBracket, notBefore: Date | null): ReadAtSuggestion | null {
  const { floor, ceiling } = bracket;
  if (!floor) return null;
  const exact = value === floor.value;
  if (!exact && !ceiling) return null;
  const readAt =
    ceiling && !exact
      ? new Date(
          floor.capturedAt.getTime() +
            ((value - floor.value) / (ceiling.value - floor.value)) *
              (ceiling.capturedAt.getTime() - floor.capturedAt.getTime()),
        )
      : floor.capturedAt;
  if (notBefore && readAt.getTime() < notBefore.getTime()) return null;
  return { readAt, floor, ceiling: exact ? null : ceiling };
}

type Reported = { value: number; capturedAt: Date | string };

/** Under a proposed Read At: the report the value matched, or the two it fell between. */
export function readAtSuggestionSentence({ floor, ceiling }: { floor: Reported; ceiling: Reported | null }): string {
  // Only John Deere reports today; the wire names no provider.
  const by = telematicsProviderLabels['john-deere'];
  return ceiling
    ? `${by} puts this reading between ${formatDate(floor.capturedAt, 'medium')} and ${formatDate(ceiling.capturedAt, 'medium')}.`
    : `${by} read ${formatHours(floor.value)} at ${formatDate(floor.capturedAt, 'medium')}.`;
}

/** The warning over a value below the latest: a Telematics latest says only Read At can fix it. */
export function belowLatestSentence(latest: Reported & { telematicsProvider: TelematicsProvider | null }): string {
  return latest.telematicsProvider
    ? `Below ${telematicsProviderLabels[latest.telematicsProvider]}'s ${formatHours(latest.value)} at ${formatDate(latest.capturedAt, 'medium')}. Set when the meter was read.`
    : `This is below the previous reading of ${formatHours(latest.value)}.`;
}

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

/** The value refusals a proposed Read At can fix: the value was most likely read earlier. */
export const proposesReadAt = (rule: CaptureRule) =>
  rule === 'contradicts-telematics' || rule === 'below-previous' || rule === 'below-latest';

/**
 * Whether this capture may land on the Machine's ledger as the server holds it under the lock. A value refusal carries
 * the Read At John Deere puts the value at, when the world's value bracket gives one.
 */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  const verdict = judgeCaptureRules(world, capture);
  if (verdict.ok || !proposesReadAt(verdict.rule)) return verdict;
  const notBefore =
    capture.role === 'departure' ? world.stintArrivedAt : capture.role === 'arrival' ? world.lastDepartedAt : null;
  const suggestedReadAt = suggestReadAt(capture.value, world.valueBracket, notBefore);
  return suggestedReadAt ? { ...verdict, suggestedReadAt } : verdict;
}

function judgeCaptureRules(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
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
  // Stints stay in time order, so a backdated Read At moves no hour between Jobs.
  const before = (at: Date | null) => at !== null && capture.readAt.getTime() < at.getTime();
  if (capture.role === 'departure' && before(world.stintArrivedAt)) return refuse('departs-before-arrival');
  if (capture.role === 'arrival' && before(world.lastDepartedAt)) return refuse('arrives-before-departure');
  if (
    capture.disputePrevious &&
    capture.expectedPreviousId !== undefined &&
    capture.expectedPreviousId !== (world.latest?.id ?? null)
  )
    return refuse('previous-changed');
  const { previous, next, previousTelematics, nextTelematics } = world;
  // A Telematics Reading is beyond dispute, so no capture may contradict the nearest one on either side.
  if (nextTelematics && capture.value > nextTelematics.value) return refuseAgainst('above-next', nextTelematics);
  if (previousTelematics && capture.value < previousTelematics.value)
    return refuseAgainst('contradicts-telematics', previousTelematics);
  if (next && capture.value > next.value) return refuseAgainst('above-next', next);
  if (previous && capture.value < previous.value && previous.id !== world.latest?.id)
    return refuseAgainst('below-previous', previous);
  const here = { value: capture.value, capturedAt: capture.readAt };
  if (previous && outrunsClock(previous, here)) return refuseOutrunsClock(previous, here, previous, 'since');
  if (next && outrunsClock(here, next)) return refuseOutrunsClock(here, next, next, 'before');
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
  latest:
    | { id: string; value: number; capturedAt: string; telematicsProvider: TelematicsProvider | null }
    | null
    | undefined;
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
  /** Below a human latest, which the person may dispute; below a Telematics Reading only Read At can fix it. */
  disputable: boolean;
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
 * The value half of a capture form: whether it is below the latest, whether that latest may be disputed, and whether
 * the dispute is confirmed. A Read At before the latest's is never judged here: only the server knows its neighbours,
 * so the form posts and shows its sentence.
 */
export function captureValueVerdict(
  latest: CaptureFormWorld['latest'],
  parsed: number | null,
  disputedReadingId: string | null,
  readAt: Date | null,
) {
  const backdated = !!latest && readAt !== null && readAt.getTime() < Date.parse(latest.capturedAt);
  const below = parsed !== null && !backdated && captureIsBelowLatest(parsed, latest ?? null);
  // A Telematics Reading is beyond dispute: below one, the only fix is Read At.
  const disputable = below && !latest?.telematicsProvider;
  return { below, disputable, disputeConfirmed: disputable && disputedReadingId === latest?.id };
}

/**
 * The form's half of the table: what a capture form can already refuse before posting, and the request it posts
 * when it cannot. Client-only affordances (a camera open, options loading) stay with each client.
 */
export function deriveCaptureForm(world: CaptureFormWorld, draft: CaptureDraft): CaptureFormVerdict {
  const parsed = parseCaptureValue(draft.value);
  const latest = world.latest ?? null;
  const { below, disputable, disputeConfirmed } = captureValueVerdict(
    latest,
    parsed,
    draft.disputedReadingId,
    draft.readAt,
  );
  const commentRequired = captureNeedsComment(draft.role, world);
  const futureReadAt = draft.readAt !== null && isFutureReadAt(draft.readAt, world.now);
  // Below a Telematics Reading the draft posts, so the server answers with the Read At John Deere puts it at.
  const passes =
    parsed !== null &&
    (!disputable || disputeConfirmed) &&
    !(commentRequired && !draft.comment.trim()) &&
    !futureReadAt;
  return {
    parsed,
    below,
    disputable,
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
