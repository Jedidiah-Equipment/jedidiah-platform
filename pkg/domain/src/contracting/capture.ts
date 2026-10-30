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
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt, type ReadAtChoice, readAtOf, readAtPending } from './read-at.js';
import {
  isReported,
  outrunsClock,
  outrunsClockSentence,
  type ReportedReading,
  type TimedValue,
  telematicsDisputeReason,
  telematicsProviderLabels,
} from './readings.js';
import { serviceDueSoonCrossed } from './service-due.js';

/** A reading either side of a capture's Read At; `telematicsProvider` names who reported a Telematics Reading. */
export type CaptureNeighbour = {
  id: string;
  role: ReadingRole;
  value: number;
  capturedAt: Date;
  telematicsProvider: TelematicsProvider | null;
};

/** A Telematics Reading as a neighbour. */
export type ReportNeighbour = ReportedReading<CaptureNeighbour>;

/** A reading's place in time: its two neighbours, and the nearest Telematics Reading on each side. */
export type Placement = {
  /** The nearest reading at or before the Read At (ties by the latest accepted), or null. */
  previous: CaptureNeighbour | null;
  /** The nearest reading after the Read At (ties by the first accepted), or null. */
  next: CaptureNeighbour | null;
  /** The nearest Telematics Reading at or before the Read At: the reading answers to it however many captured readings stand between. */
  previousTelematics: CaptureNeighbour | null;
  /** The nearest Telematics Reading after the Read At. */
  nextTelematics: CaptureNeighbour | null;
};

/**
 * What an Hour Reading capture is judged against: the server's rows under the Machine lock, gathered by core as
 * facts. Outside this table, and enforced elsewhere: a replayed capture id, a Machine or Assignment that does not
 * exist, and the two busy rules, which the database's unique constraints raise after the write.
 */
export type CaptureWorld = Placement & {
  /** The Machine's latest reading by Read At, or null while its ledger is empty. */
  latest: { id: string; value: number } | null;
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

/** The rules a reading answers to at its place in time, whether captured there or amended to it. */
export type PlacementRule = 'above-next' | 'contradicts-telematics' | 'below-previous' | 'outruns-clock';

/** The refusals that bring their own sentence. */
type SentencedRule = 'job-refused' | PlacementRule;

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
};
/** `disputes` names the latest reading an accepted capture below it disputes. */
export type CaptureVerdict = { ok: true; disputes: string | null } | CaptureRefused;

const refuse = (rule: Exclude<CaptureRule, SentencedRule>): CaptureRefused => ({
  ok: false,
  rule,
  reason: captureRefusals[rule].code,
  message: captureRefusals[rule].message,
});

/** Where a reading falls outside its place: the rule, the neighbour it answers to, and one sentence naming it. */
export type Misplacement = { rule: PlacementRule; neighbour: CaptureNeighbour; sentence: string };

/** Against a neighbour, naming its value and Read At; the fix is the reading's time or its value. */
const against = (rule: Exclude<PlacementRule, 'outruns-clock'>, neighbour: CaptureNeighbour): Misplacement => {
  const reading = `${formatHours(neighbour.value)} at ${formatDate(neighbour.capturedAt, 'medium')}`;
  const said = isReported(neighbour)
    ? telematicsDisputeReason(neighbour)
    : rule === 'above-next'
      ? `A later reading of ${reading} is lower.`
      : `A reading of ${reading} is higher.`;
  return { rule, neighbour, sentence: `${said} Check the time or the value.` };
};

/**
 * Whether a reading may sit at its place in time: never contradicting the nearest Telematics Reading on either side,
 * never above the next reading or below the previous one, and never outrunning the clock against either. One judge for
 * a capture and an amendment alike; each words its own refusal. `latestId` names the latest reading a capture may
 * dispute rather than be refused below; an amendment disputes nothing, so it names none.
 */
export function judgePlacement(
  { previous, next, previousTelematics, nextTelematics }: Placement,
  here: TimedValue,
  latestId: string | null = null,
): Misplacement | null {
  if (nextTelematics && here.value > nextTelematics.value) return against('above-next', nextTelematics);
  if (previousTelematics && here.value < previousTelematics.value)
    return against('contradicts-telematics', previousTelematics);
  if (next && here.value > next.value) return against('above-next', next);
  if (previous && here.value < previous.value && previous.id !== latestId) return against('below-previous', previous);
  if (previous && outrunsClock(previous, here))
    return {
      rule: 'outruns-clock',
      neighbour: previous,
      sentence: outrunsClockSentence(previous, here, previous, 'since'),
    };
  if (next && outrunsClock(here, next))
    return { rule: 'outruns-clock', neighbour: next, sentence: outrunsClockSentence(here, next, next, 'before') };
  return null;
}

const placementCodes: Record<PlacementRule, ReadingErrorCode> = {
  'above-next': 'reading.above_next',
  'contradicts-telematics': 'reading.below_latest',
  'below-previous': 'reading.below_latest',
  'outruns-clock': 'reading.outruns_clock',
};

/** A misplaced capture refused; outrunning the clock is fixed by a Read At, on this reading or on that one from its Job. */
const refuseMisplaced = ({ rule, sentence }: Misplacement): CaptureRefused => ({
  ok: false,
  rule,
  reason: placementCodes[rule],
  message:
    rule === 'outruns-clock'
      ? `${sentence} Check Read At on this reading, or correct that reading's Read At from its Job.`
      : sentence,
});

/** The place the entry at `index` holds in a ledger in Read At order. */
export function placementIn(ledger: readonly CaptureNeighbour[], index: number): Placement {
  return {
    previous: ledger[index - 1] ?? null,
    next: ledger[index + 1] ?? null,
    previousTelematics: ledger.slice(0, index).findLast(isReported) ?? null,
    nextTelematics: ledger.slice(index + 1).find(isReported) ?? null,
  };
}

/**
 * The Telematics Readings a value falls between: the last reported at or below it, and the first reported above it,
 * with `createdAt`, when the poll that first saw its value stored it.
 */
export type ValueBracket = { floor: ReportNeighbour | null; ceiling: (ReportNeighbour & { createdAt: Date }) | null };

export type SuggestedReadAt = {
  readAt: Date;
  /** The report the value matched, or the two it fell between, so the form can say so. */
  floor: ReportNeighbour;
  ceiling: ReportNeighbour | null;
};

/** When a Telematics Reading's value was first reported: its Read At moves on while the value stands. */
const firstReportedAt = ({ capturedAt, createdAt }: { capturedAt: Date; createdAt: Date }) =>
  new Date(Math.min(capturedAt.getTime(), createdAt.getTime()));

/**
 * When John Deere says a value was on the meter: the floor's Read At when the value matches it (a Telematics Reading's
 * Read At is the last time that value was reported), otherwise the moment between the floor and when the ceiling's
 * value was first reported at which hours would have reached it, which inside an hourly poll is near exact. Null when
 * no Telematics Reading brackets the value, or when the moment would break the stint's time order anyway.
 */
export function suggestReadAt(value: number, bracket: ValueBracket, notBefore: Date | null): SuggestedReadAt | null {
  const { floor } = bracket;
  if (!floor) return null;
  const exact = value === floor.value;
  const ceiling =
    !exact && bracket.ceiling ? { ...bracket.ceiling, capturedAt: firstReportedAt(bracket.ceiling) } : null;
  if (!exact && !ceiling) return null;
  const readAt = ceiling
    ? new Date(
        floor.capturedAt.getTime() +
          ((value - floor.value) / (ceiling.value - floor.value)) *
            (ceiling.capturedAt.getTime() - floor.capturedAt.getTime()),
      )
    : floor.capturedAt;
  if (notBefore && readAt.getTime() < notBefore.getTime()) return null;
  return { readAt, floor, ceiling };
}

/** The earliest Read At the stint order lets a proposal take: a departure's arrival, an arrival's last departure. */
export const earliestReadAtFor = (
  role: ReadingRole,
  world: Pick<CaptureWorld, 'stintArrivedAt' | 'lastDepartedAt'>,
): Date | null => (role === 'departure' ? world.stintArrivedAt : role === 'arrival' ? world.lastDepartedAt : null);

type Reported = { value: number; capturedAt: Date | string };

/** Under a proposed Read At: the report the value matched, or the two it fell between. */
export function readAtSuggestionSentence({
  floor,
  ceiling,
}: {
  floor: Reported & { telematicsProvider: TelematicsProvider };
  ceiling: Reported | null;
}): string {
  const by = telematicsProviderLabels[floor.telematicsProvider];
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
 * Whether this capture may land on the Machine's ledger as the server holds it under the lock. A refusal the caller
 * may answer with a proposed Read At is one `proposesReadAt` names; `suggestReadAt` proposes it.
 */
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
  const misplaced = judgePlacement(
    world,
    { value: capture.value, capturedAt: capture.readAt },
    world.latest?.id ?? null,
  );
  if (misplaced) return refuseMisplaced(misplaced);
  const { previous, next } = world;
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
  readAt: ReadAtChoice;
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
  /**
   * Save waits on the person before it can post anything: a dispute below a human latest, or a time under Earlier….
   * Everything else a form can refuse, it says on submit.
   */
  awaitingPerson: boolean;
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
  const readAt = readAtOf(draft.readAt);
  const { below, disputable, disputeConfirmed } = captureValueVerdict(latest, parsed, draft.disputedReadingId, readAt);
  const commentRequired = captureNeedsComment(draft.role, world);
  const futureReadAt = readAt !== null && isFutureReadAt(readAt, world.now);
  // Below a Telematics Reading the draft posts, so the server answers with the Read At John Deere puts it at.
  const awaitingPerson = (disputable && !disputeConfirmed) || readAtPending(draft.readAt);
  const passes = parsed !== null && !awaitingPerson && !(commentRequired && !draft.comment.trim()) && !futureReadAt;
  return {
    parsed,
    below,
    disputable,
    disputeConfirmed,
    commentRequired,
    futureReadAt,
    awaitingPerson,
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
