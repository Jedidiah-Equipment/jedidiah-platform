import {
  type AssignmentState,
  type JobActionBlockedReason,
  type JobActionVerdict,
  type ReadingCaptureInput,
  type ReadingErrorCode,
  type ReadingRole,
  ReadingValue,
  type TelematicsProvider,
  type ReadAtEstimate as WireReadAtEstimate,
} from '@pkg/schema/contracting';
import { formatDate, toPlantDateOnly } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { assignmentActionRefusal, assignmentStateAllows } from './assignment-actions.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import {
  hoursBetween,
  isReported,
  outrunsClock,
  outrunsClockSentence,
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
  /** May capture a Baseline Reading. */
  mayBaseline: boolean;
  machineRetired: boolean;
  /** An arrival's Implement as the stint plus overrides resolve it; true when none is named. */
  implementValid: boolean;
  /** An arrival's Driver as the stint plus overrides resolve them; true when none is named. */
  driverValid: boolean;
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
};

/** Every way `judgeCapture` refuses a capture, in the order it judges them. */
export type CaptureRule =
  | 'baseline-forbidden'
  | 'future-read-at'
  | 'retired-machine'
  | 'job-refused'
  | 'implement-invalid'
  | 'driver-invalid'
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

/**
 * The place the entry at `index` holds in a ledger in Read At order. Telematics Readings can fall back, so on each side
 * the report that binds it is the nearest one it contradicts, else the nearest: every report holds it to sequence.
 */
export function placementIn(ledger: readonly CaptureNeighbour[], index: number): Placement {
  const here = ledger[index];
  const binding = (reports: readonly CaptureNeighbour[], contradicted: (report: CaptureNeighbour) => boolean) =>
    reports.find(contradicted) ?? reports[0] ?? null;
  return {
    previous: ledger[index - 1] ?? null,
    next: ledger[index + 1] ?? null,
    previousTelematics: binding(
      ledger.slice(0, index).filter(isReported).reverse(),
      (report) => !!here && here.value < report.value,
    ),
    nextTelematics: binding(
      ledger.slice(index + 1).filter(isReported),
      (report) => !!here && here.value > report.value,
    ),
  };
}

/** A reading as the estimate sees it; `createdAt` is acceptance, used to find when a report's value was first seen. */
export type EstimateNeighbour = CaptureNeighbour & { createdAt: Date };

/** What core gathers for one typed value: the ledger's latest, the readings bracketing the value, and the stint's floor. */
export type EstimateFacts = {
  /** The capture's role, which names what `notBefore` is the Read At of. */
  role: ReadingRole;
  latest: CaptureNeighbour | null;
  /** The last reading (any method) whose value is at or below the typed one, by Read At. */
  floor: EstimateNeighbour | null;
  /** The first reading after the floor by Read At. */
  ceiling: EstimateNeighbour | null;
  /** The earliest Read At stint order allows: a departure's arrival, an arrival's last departure, null for a spot. */
  notBefore: Date | null;
  now: Date;
};

type EstimatedReadAt = {
  readAt: Date;
  floor: EstimateNeighbour;
  ceiling: EstimateNeighbour | null;
  overAWeek: boolean;
};

export type ReadAtEstimate =
  /** An empty ledger, or nothing to estimate from: the date is now and editable. */
  | { kind: 'none' }
  /** At or above the latest reading and reachable since it: the date is now, editable. */
  | { kind: 'now' }
  /** No date can be right; the sentence says why and the form asks for the hours again. */
  | { kind: 'impossible'; sentence: string }
  /** Between two Telematics Readings: locked. */
  | ({ kind: 'telematics' } & EstimatedReadAt)
  /** Between readings of which at least one is human: a guess, editable. */
  | ({ kind: 'human' } & EstimatedReadAt);

/** A Read At more than a week before now: the form asks the person to check the hours, and never blocks. */
const isOverAWeekAgo = (readAt: Date, now: Date) => hoursBetween(readAt, now) > 7 * 24;

/** When a Telematics Reading's value was first reported: its Read At moves on while the value stands. */
const firstSeenAt = ({ capturedAt, createdAt, telematicsProvider }: EstimateNeighbour) =>
  telematicsProvider ? new Date(Math.min(capturedAt.getTime(), createdAt.getTime())) : capturedAt;

/** "The meter cannot have reached 1 258.2 h yet: 25.4 h since 1 232.8 h at 27 Oct 2026, 16:17. Check the hours." */
export const cannotHaveReachedSentence = (value: number, latest: TimedValue) =>
  `The meter cannot have reached ${formatHours(value)} yet: ${formatHours(value - latest.value)} since ${formatHours(latest.value)} at ${formatDate(latest.capturedAt, 'medium')}. Check the hours.`;

/** "John Deere puts 2 906.7 h before this stint's arrival at 27 Oct 2026, 15:00. Check the hours." */
export const beforeStintSentence = (
  value: number,
  floor: Pick<CaptureNeighbour, 'telematicsProvider'>,
  notBefore: Date,
  role: ReadingRole,
) =>
  `${telematicsProviderLabels[floor.telematicsProvider ?? 'john-deere']} puts ${formatHours(value)} before ${role === 'arrival' ? "the Machine's last departure" : "this stint's arrival"} at ${formatDate(notBefore, 'medium')}. Check the hours.`;

/**
 * When the ledger says a value was on the meter. At or above the latest the answer is now, or nothing when the meter
 * cannot have got there yet. Below it, the moment between the floor and the ceiling at which hours would have reached
 * the value; locked when both are reports, a guess otherwise. A moment before the stint's floor is impossible when
 * John Deere fixes it, and no estimate at all when only a guess does.
 */
export function estimateReadAt(value: number, facts: EstimateFacts): ReadAtEstimate {
  const { role, latest, floor, ceiling, notBefore, now } = facts;
  if (!latest) return { kind: 'none' };
  if (value >= latest.value)
    return outrunsClock(latest, { value, capturedAt: now })
      ? { kind: 'impossible', sentence: cannotHaveReachedSentence(value, latest) }
      : { kind: 'now' };
  if (!floor) return { kind: 'none' };
  const exact = value === floor.value;
  const upper = !exact && ceiling ? { ...ceiling, capturedAt: firstSeenAt(ceiling) } : null;
  if (!exact && !upper) return { kind: 'none' };
  const readAt = upper
    ? new Date(
        floor.capturedAt.getTime() +
          ((value - floor.value) / (upper.value - floor.value)) *
            (upper.capturedAt.getTime() - floor.capturedAt.getTime()),
      )
    : floor.capturedAt;
  const locked = !!floor.telematicsProvider && (exact || !!upper?.telematicsProvider);
  if (notBefore && readAt.getTime() < notBefore.getTime())
    return locked
      ? { kind: 'impossible', sentence: beforeStintSentence(value, floor, notBefore, role) }
      : { kind: 'none' };
  return {
    kind: locked ? 'telematics' : 'human',
    readAt,
    floor,
    ceiling: upper,
    overAWeek: isOverAWeekAgo(readAt, now),
  };
}

/** An estimate that names a moment: the only kinds a capture refusal proposes as its Read At. */
export const namesReadAt = <T extends { kind: string }>(
  estimate: T,
): estimate is Extract<T, { kind: 'telematics' | 'human' }> =>
  estimate.kind === 'telematics' || estimate.kind === 'human';

/** The earliest Read At the stint order lets a proposal take: a departure's arrival, an arrival's last departure. */
export const earliestReadAtFor = (
  role: ReadingRole,
  world: Pick<CaptureWorld, 'stintArrivedAt' | 'lastDepartedAt'>,
): Date | null => (role === 'departure' ? world.stintArrivedAt : role === 'arrival' ? world.lastDepartedAt : null);

/** The estimate line: "Read on 28 Oct 2026, 14:30 per John Deere" / "Read about 28 Oct 2026, 14:30" / "Read now". */
export function estimateSentence(estimate: ReadAtEstimate | WireReadAtEstimate): string {
  switch (estimate.kind) {
    case 'none':
    case 'now':
      return 'Read now';
    case 'impossible':
      return estimate.sentence;
    case 'telematics':
      return `Read on ${formatDate(estimate.readAt, 'medium')} per ${telematicsProviderLabels[estimate.floor.telematicsProvider ?? 'john-deere']}`;
    case 'human':
      return `Read about ${formatDate(estimate.readAt, 'medium')}`;
  }
}

/** "This reading looks like it was read on 28 Oct 2026, not today." */
export const outsideTodaySentence = (readAt: Date) =>
  `This reading looks like it was read on ${formatDate(readAt, 'short')}, not today.`;

/** "Please check the hours: this reading would be from 21 Oct 2026, 09:10, over a week ago." */
export const overAWeekSentence = (readAt: Date) =>
  `Please check the hours: this reading would be from ${formatDate(readAt, 'medium')}, over a week ago.`;

/** Over the dispute fork: "This is below the latest reading of 4 728.4 h at 27 Oct 2026, 17:35." */
export const belowLatestSentence = (latest: { value: number; capturedAt: Date | string }) =>
  `This is below the latest reading of ${formatHours(latest.value)} at ${formatDate(latest.capturedAt, 'medium')}.`;

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

/** The value refusals a proposed Read At can fix: the value was most likely read earlier. */
export const proposesReadAt = (rule: CaptureRule) =>
  rule === 'contradicts-telematics' || rule === 'below-previous' || rule === 'below-latest';

/**
 * Whether this capture may land on the Machine's ledger as the server holds it under the lock. A refusal the caller
 * may answer with a proposed Read At is one `proposesReadAt` names; `estimateReadAt` proposes it.
 */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  if (capture.role === 'baseline' && !world.mayBaseline) return refuse('baseline-forbidden');
  if (isFutureReadAt(capture.readAt, world.now, world.futureToleranceMs)) return refuse('future-read-at');
  if (world.machineRetired) return refuse('retired-machine');
  if (world.jobVerdict && !world.jobVerdict.allowed) return refuseJob(world.jobVerdict);
  if (!world.implementValid) return refuse('implement-invalid');
  if (!world.driverValid) return refuse('driver-invalid');
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

/** What a capture form knows: the served latest, undefined while it loads. */
export type CaptureFormWorld = {
  latest:
    | { id: string; value: number; capturedAt: string; telematicsProvider: TelematicsProvider | null }
    | null
    | undefined;
  now: Date;
};

/** Step 1's answer: a declaration, not data. It decides only how the date step opens and what it warns of. */
export type CaptureWhen = 'today' | 'earlier';

/** The date the person vouched for, tied to the hours it was vouched for: either changing re-asks. */
export type CaptureDateConfirmation = { value: number; readAt: Date | null };

export type CaptureDraft = {
  role: Exclude<ReadingRole, 'baseline'>;
  /** Step 1: null until the person chooses. */
  when: CaptureWhen | null;
  /** Step 2: the value as typed. */
  value: string;
  /** The server's estimate for `value`; undefined while it is in flight or `value` is not a reading. */
  estimate: WireReadAtEstimate | undefined;
  /** Step 3: the date the person picked, if any; null means the estimate (or now) stands. */
  pickedReadAt: Date | null;
  /** The reading the person said is wrong, or null. */
  disputedReadingId: string | null;
  /** Step 3's Date looks good, for this value and date. */
  dateConfirmed: CaptureDateConfirmation | null;
  /** Under Today, the person tapped the date to change it; Earlier opens it from the start. */
  dateOpened: boolean;
  /** Step 4. */
  comment: string;
  stintOverrides: ReadingCaptureInput['stintOverrides'];
};

/** The wizard's own answers, which each client holds beside the hours and the details. */
export type CaptureSteps = Pick<
  CaptureDraft,
  'when' | 'pickedReadAt' | 'disputedReadingId' | 'dateConfirmed' | 'dateOpened'
>;

export const CAPTURE_STEPS_START: CaptureSteps = {
  when: null,
  pickedReadAt: null,
  disputedReadingId: null,
  dateConfirmed: null,
  dateOpened: false,
};

/** A changed Today or Earlier keeps the hours and asks for the date again. */
export const stepsAfterWhen = (steps: CaptureSteps, when: CaptureWhen): CaptureSteps => ({
  ...steps,
  when,
  dateConfirmed: null,
});

/** A changed number re-asks for the date: a pick, a dispute and a confirmation all belong to the hours they were for. */
export const stepsAfterValueEdit = (steps: CaptureSteps): CaptureSteps => ({
  ...steps,
  pickedReadAt: null,
  disputedReadingId: null,
  dateConfirmed: null,
  dateOpened: false,
});

/** Read earlier, from the dispute fork: the estimate's date when the ledger names one, else the picker opens. */
export const stepsAfterReadEarlier = (steps: CaptureSteps, estimate: WireReadAtEstimate | undefined): CaptureSteps =>
  estimate && namesReadAt(estimate)
    ? { ...steps, pickedReadAt: new Date(estimate.readAt) }
    : { ...steps, dateOpened: true };

/** A refusal that proposes a Read At reopens the date step on it; nothing is saved until the next Save. */
export const stepsAfterRefusal = (
  steps: CaptureSteps,
  proposal: WireReadAtEstimate | null | undefined,
): CaptureSteps =>
  proposal && namesReadAt(proposal)
    ? { ...steps, pickedReadAt: new Date(proposal.readAt), dateConfirmed: null }
    : steps;

/** The request fields a form posts; the client adds where it lands and when. */
export type CaptureRequest = Pick<
  ReadingCaptureInput,
  'role' | 'value' | 'comment' | 'disputePrevious' | 'expectedPreviousId' | 'stintOverrides'
>;

export type CaptureStep = 'when' | 'hours' | 'date' | 'details';

export type CaptureDateWarning = 'outside-today' | 'over-a-week';

/** The fork over a human latest the hours fall below, while it is offered or the dispute is confirmed. */
export type CaptureDispute = { sentence: string; readingId: string; confirmed: boolean };

/** Where the date step's date came from: a pick only when it differs from the estimate. */
export type CaptureDateSource = 'now' | 'estimate' | 'picked';

export type CaptureFormVerdict = {
  step: CaptureStep;
  parsed: number | null;
  /** The line under the hours input, once there is an estimate: its sentence, or the impossible sentence. */
  estimateLine: string | null;
  /** Step 3, once the estimate allows it. */
  date: {
    /** The date the form will post: the pick, else the estimate, else now (null). */
    readAt: Date | null;
    source: CaptureDateSource;
    /** The date as the step shows it: "Read on … per John Deere", "Read about …", "Read on …", "Read now". */
    line: string;
    locked: boolean;
    /** The picker shows: never on a locked date, from the start under Earlier, once tapped under Today. */
    open: boolean;
    /** Under Today no date shows yet: the fork decides it, unless the picker is open. */
    awaitsFork: boolean;
    warnings: CaptureDateWarning[];
    /** Each warning's sentence, in the same order. */
    warningLines: string[];
    /** Below a human latest: the person must pick Read earlier or dispute. */
    disputeOffered: boolean;
    dispute: CaptureDispute | null;
    /** Date looks good may be pressed: no dispute waits and the date is not still to come. */
    confirmable: boolean;
  } | null;
  below: boolean;
  /** Below a human latest, which the person may dispute; below a Telematics Reading only Read At can fix it. */
  disputable: boolean;
  disputeConfirmed: boolean;
  futureReadAt: boolean;
  /** Save waits on the person: every step before the details. */
  awaitingPerson: boolean;
  /** Null until the details step; then the request the client posts. */
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
function captureValueVerdict(
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

const sameInstant = (left: Date | null, right: Date | null) => (left?.getTime() ?? null) === (right?.getTime() ?? null);

/**
 * The capture wizard: which step it is on, what the date step shows, and the request it posts once the person has
 * vouched for the date. Below a human latest the guess waits for the person to say the meter was read earlier or
 * that the latest is wrong. The server's `judgeCapture` stays the safety net.
 */
export function deriveCaptureForm(world: CaptureFormWorld, draft: CaptureDraft): CaptureFormVerdict {
  const parsed = parseCaptureValue(draft.value);
  const latest = world.latest ?? null;
  const estimate = parsed === null ? undefined : draft.estimate;
  const estimated = estimate && namesReadAt(estimate) ? new Date(estimate.readAt) : null;
  const locked = estimate?.kind === 'telematics';
  const belowHumanLatest = parsed !== null && !!latest && !latest.telematicsProvider && parsed < latest.value;
  const readAt = locked ? estimated : (draft.pickedReadAt ?? (belowHumanLatest ? null : estimated));
  const { below, disputable, disputeConfirmed } = captureValueVerdict(latest, parsed, draft.disputedReadingId, readAt);
  const futureReadAt = readAt !== null && isFutureReadAt(readAt, world.now);
  const disputeOffered = below && disputable && !disputeConfirmed;
  const warnings: CaptureDateWarning[] = [
    ...(draft.when === 'today' && toPlantDateOnly(readAt ?? world.now) !== toPlantDateOnly(world.now)
      ? (['outside-today'] as const)
      : []),
    ...(readAt && isOverAWeekAgo(readAt, world.now) ? (['over-a-week'] as const) : []),
  ];
  const source: CaptureDateSource = readAt === null ? 'now' : sameInstant(readAt, estimated) ? 'estimate' : 'picked';
  const open = !locked && (draft.when === 'earlier' || draft.dateOpened);
  const date =
    draft.when !== null && estimate !== undefined && estimate.kind !== 'impossible'
      ? {
          readAt,
          source,
          line:
            readAt === null
              ? 'Read now'
              : source === 'estimate'
                ? estimateSentence(estimate)
                : `Read on ${formatDate(readAt, 'medium')}`,
          locked,
          open,
          awaitsFork: disputeOffered && !open,
          warnings,
          warningLines: warnings.map((warning) =>
            warning === 'outside-today'
              ? outsideTodaySentence(readAt ?? world.now)
              : overAWeekSentence(readAt ?? world.now),
          ),
          disputeOffered,
          dispute:
            latest && (disputeOffered || disputeConfirmed)
              ? { sentence: belowLatestSentence(latest), readingId: latest.id, confirmed: disputeConfirmed }
              : null,
          confirmable: !disputeOffered && !futureReadAt,
        }
      : null;
  const confirmed =
    parsed !== null && draft.dateConfirmed?.value === parsed && sameInstant(draft.dateConfirmed.readAt, readAt);
  const step: CaptureStep =
    draft.when === null ? 'when' : !date ? 'hours' : date.confirmable && confirmed ? 'details' : 'date';
  return {
    step,
    parsed,
    estimateLine: estimate ? estimateSentence(estimate) : null,
    date,
    below,
    disputable,
    disputeConfirmed,
    futureReadAt,
    awaitingPerson: step !== 'details',
    request:
      step === 'details' && parsed !== null
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

/** Date looks good: the hours and the date the form shows, vouched for together. */
export const confirmCaptureDate = (verdict: CaptureFormVerdict): CaptureDateConfirmation | null =>
  verdict.parsed !== null && verdict.date?.confirmable ? { value: verdict.parsed, readAt: verdict.date.readAt } : null;
