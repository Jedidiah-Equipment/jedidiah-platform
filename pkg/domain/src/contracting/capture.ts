import {
  type ReadingCaptureInput,
  type ReadingErrorCode,
  ReadingValue,
  type TelematicsProvider,
  type ReadAtEstimate as WireReadAtEstimate,
} from '@pkg/schema/contracting';
import { formatDate, toPlantDateOnly } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import {
  hoursBetween,
  isReported,
  outrunsClock,
  outrunsClockSentence,
  type TimedValue,
  telematicsProviderLabels,
  telematicsReportedSentence,
} from './readings.js';

/** A reading either side of a capture's Read At; `telematicsProvider` names who reported a Telematics Reading. */
export type CaptureNeighbour = {
  id: string;
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
 * What a spot reading capture is judged against: the server's ledger rows under the Machine lock, gathered by core as
 * facts. A replayed capture id and a Machine that does not exist are enforced outside this table.
 */
export type CaptureWorld = Placement & {
  /** The Machine's latest reading by Read At, or null while its ledger is empty. */
  latest: { id: string; value: number } | null;
  machineRetired: boolean;
  now: Date;
  /** Phone clocks drift; the server passes FUTURE_READ_AT_TOLERANCE_MS. */
  futureToleranceMs: number;
};

export type CaptureAttempt = { value: number; readAt: Date };

/** Every way `judgeCapture` refuses a spot reading, in the order it judges them. */
export type CaptureRule =
  | 'future-read-at'
  | 'retired-machine'
  | 'above-next'
  | 'below-previous'
  | 'outruns-clock'
  | 'below-latest';

/** The rules a reading answers to at its place in time, whether captured there or amended to it. */
export type PlacementRule = 'above-next' | 'below-previous' | 'outruns-clock';

/** The wire code and the one sentence of each refusal that does not bring its own. */
export const captureRefusals: Record<
  Exclude<CaptureRule, PlacementRule>,
  { code: ReadingErrorCode; message: string }
> = {
  'future-read-at': { code: 'reading.future_read_at', message: FUTURE_READ_AT_REFUSAL },
  'retired-machine': { code: 'reading.retired_machine', message: 'Cannot capture readings for a retired Machine.' },
  'below-latest': { code: 'reading.below_latest', message: 'Reading is below the latest reading.' },
};

export type CaptureRefused = { ok: false; rule: CaptureRule; reason: ReadingErrorCode; message: string };
export type CaptureVerdict = { ok: true } | CaptureRefused;

const refuse = (rule: Exclude<CaptureRule, PlacementRule>): CaptureRefused => ({
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
    ? telematicsReportedSentence(neighbour)
    : rule === 'above-next'
      ? `A later reading of ${reading} is lower.`
      : `A reading of ${reading} is higher.`;
  return { rule, neighbour, sentence: `${said} Check the time or the value.` };
};

/**
 * Whether a reading may sit at its place in time: never below the nearest Telematics Reading before it or above the
 * one after it, never above the next reading or below the previous one, and never outrunning the clock against either.
 * One judge for a capture and an amendment alike; each words its own refusal. `latestId` names the latest reading,
 * which a capture is refused below in its own words; an amendment names none.
 */
export function judgePlacement(
  { previous, next, previousTelematics, nextTelematics }: Placement,
  here: TimedValue,
  latestId: string | null = null,
): Misplacement | null {
  if (nextTelematics && here.value > nextTelematics.value) return against('above-next', nextTelematics);
  if (previousTelematics && here.value < previousTelematics.value) return against('below-previous', previousTelematics);
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
  'below-previous': 'reading.below_latest',
  'outruns-clock': 'reading.outruns_clock',
};

/** A misplaced capture refused; outrunning the clock is fixed by a Read At, on this reading or that one. */
const refuseMisplaced = ({ rule, sentence }: Misplacement): CaptureRefused => ({
  ok: false,
  rule,
  reason: placementCodes[rule],
  message:
    rule === 'outruns-clock' ? `${sentence} Check Read At on this reading, or amend that reading's Read At.` : sentence,
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

/** What core gathers for one typed value: the ledger's latest and the readings bracketing the value. */
export type EstimateFacts = {
  latest: CaptureNeighbour | null;
  /** The last reading (any method) whose value is at or below the typed one, by Read At. */
  floor: EstimateNeighbour | null;
  /** The first reading after the floor by Read At. */
  ceiling: EstimateNeighbour | null;
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

/**
 * When the ledger says a value was on the meter. At or above the latest the answer is now, or nothing when the meter
 * cannot have got there yet. Below it, the moment between the floor and the ceiling at which hours would have reached
 * the value; locked when both are reports, a guess otherwise.
 */
export function estimateReadAt(value: number, facts: EstimateFacts): ReadAtEstimate {
  const { latest, floor, ceiling, now } = facts;
  if (!latest) return { kind: 'none' };
  if (value >= latest.value)
    return outrunsClock(latest, { value, capturedAt: now })
      ? { kind: 'impossible', sentence: cannotHaveReachedSentence(value, latest) }
      : { kind: 'now' };
  if (!floor) return { kind: 'none' };
  const exact = value === floor.value;
  // A captured floor can sit after the report first saw the ceiling's value; then only the report's Read At bounds it.
  const ceilingAt = ceiling && (firstSeenAt(ceiling) > floor.capturedAt ? firstSeenAt(ceiling) : ceiling.capturedAt);
  const upper = !exact && ceiling && ceilingAt ? { ...ceiling, capturedAt: ceilingAt } : null;
  if (!exact && !upper) return { kind: 'none' };
  const readAt = upper
    ? new Date(
        floor.capturedAt.getTime() +
          ((value - floor.value) / (upper.value - floor.value)) *
            (upper.capturedAt.getTime() - floor.capturedAt.getTime()),
      )
    : floor.capturedAt;
  const locked = !!floor.telematicsProvider && (exact || !!upper?.telematicsProvider);
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

/** The value refusals a proposed Read At can fix: the value was most likely read earlier. */
export const proposesReadAt = (rule: CaptureRule) => rule === 'below-previous' || rule === 'below-latest';

/**
 * Whether this spot reading may land on the Machine's ledger as the server holds it under the lock. A refusal the
 * caller may answer with a proposed Read At is one `proposesReadAt` names; `estimateReadAt` proposes it.
 */
export function judgeCapture(world: CaptureWorld, capture: CaptureAttempt): CaptureVerdict {
  if (isFutureReadAt(capture.readAt, world.now, world.futureToleranceMs)) return refuse('future-read-at');
  if (world.machineRetired) return refuse('retired-machine');
  const misplaced = judgePlacement(
    world,
    { value: capture.value, capturedAt: capture.readAt },
    world.latest?.id ?? null,
  );
  if (misplaced) return refuseMisplaced(misplaced);
  // Only a capture that becomes the latest is judged against it; one dated behind it answers to its neighbours.
  if (world.next === null && world.latest && capture.value < world.latest.value) return refuse('below-latest');
  return { ok: true };
}

/** What a capture form knows beside the draft: the clock it warns against. */
export type CaptureFormWorld = { now: Date };

/** Step 1's answer: a declaration, not data. It decides only how the date step opens and what it warns of. */
export type CaptureWhen = 'today' | 'earlier';

/** The date the person vouched for, tied to the hours it was vouched for: either changing re-asks. */
export type CaptureDateConfirmation = { value: number; readAt: Date | null };

/** The wizard's own answers, which each client holds beside the hours and the details. */
export type CaptureSteps = {
  /** Step 1: null until the person chooses. */
  when: CaptureWhen | null;
  /** Step 3: the date the person picked, if any; null means the estimate (or now) stands. */
  pickedReadAt: Date | null;
  /** Step 3's Date looks good, for this value and date. */
  dateConfirmed: CaptureDateConfirmation | null;
  /** Under Today, the person tapped the date to change it; Earlier opens it from the start. */
  dateOpened: boolean;
};

export type CaptureDraft = CaptureSteps & {
  /** Step 2: the value as typed. */
  value: string;
  /** The server's estimate for `value`; undefined while it is in flight or `value` is not a reading. */
  estimate: WireReadAtEstimate | undefined;
  /** Step 4. */
  comment: string;
};

export const CAPTURE_STEPS_START: CaptureSteps = {
  when: null,
  pickedReadAt: null,
  dateConfirmed: null,
  dateOpened: false,
};

/** Refusals that mean the ledger moved under the form: its latest must be read again. */
const LEDGER_MOVED = new Set<string>(['reading.below_latest', 'reading.above_next'] satisfies ReadingErrorCode[]);

export const ledgerMoved = (code: string | undefined): boolean => code !== undefined && LEDGER_MOVED.has(code);

/** Everything that moves the wizard's steps: the person's answers, and a refusal from the server. */
export type CaptureStepAction =
  /** Today or Earlier chosen: the hours stay, the date is asked again. */
  | { type: 'when'; when: CaptureWhen }
  /** The hours changed: a pick and a confirmation both belonged to the hours they were for. */
  | { type: 'value-edited' }
  /** Under Today, the date line tapped, so its picker shows. */
  | { type: 'date-opened' }
  /** A date picked, or cleared so the estimate stands again. */
  | { type: 'date-picked'; readAt: Date | null }
  /** The picker shows a date it cannot name yet: Date looks good must be pressed again. */
  | { type: 'date-unconfirmed' }
  /** Date looks good, over the verdict on screen. */
  | { type: 'date-confirmed'; verdict: CaptureFormVerdict }
  /** The server refused: a proposed Read At reopens the date step on it. */
  | { type: 'refused'; code: string | undefined; proposal: WireReadAtEstimate | null | undefined }
  /** The form closed or saved: every step is asked again. */
  | { type: 'reset' };

/** The one table of step changes; both clients hold `CaptureSteps` under it and nothing else. */
export function captureStepsReducer(steps: CaptureSteps, action: CaptureStepAction): CaptureSteps {
  switch (action.type) {
    case 'when':
      return { ...steps, when: action.when, dateConfirmed: null };
    case 'value-edited':
      return { ...steps, pickedReadAt: null, dateConfirmed: null, dateOpened: false };
    case 'date-opened':
      return { ...steps, dateOpened: true };
    case 'date-picked':
      return { ...steps, pickedReadAt: action.readAt };
    case 'date-unconfirmed':
      return { ...steps, dateConfirmed: null };
    case 'date-confirmed':
      return { ...steps, dateConfirmed: confirmCaptureDate(action.verdict) };
    case 'refused':
      return action.proposal && namesReadAt(action.proposal)
        ? { ...steps, pickedReadAt: new Date(action.proposal.readAt), dateConfirmed: null }
        : steps;
    case 'reset':
      return CAPTURE_STEPS_START;
  }
}

/** The request fields a form posts; the client adds where it lands and when. */
export type CaptureRequest = Pick<ReadingCaptureInput, 'value' | 'comment'>;

export type CaptureStep = 'when' | 'hours' | 'date' | 'details';

/** Where the date step's date came from: a pick only when it differs from the estimate. */
export type CaptureDateSource = 'now' | 'estimate' | 'picked';

/** What the person answered along the way, as the phone's `reading captured` records it. */
export type CaptureAnswers = { when: CaptureWhen; estimateKind: WireReadAtEstimate['kind']; dateEdited: boolean };

/** Step 3, once the estimate allows it. */
export type CaptureDateStep = {
  /** The date the form will post: the pick, else the estimate, else now (null). */
  readAt: Date | null;
  source: CaptureDateSource;
  /** The date as the step shows it: "Read on … per John Deere", "Read about …", "Read on …", "Read now". */
  line: string;
  locked: boolean;
  /** The picker shows: never on a locked date, from the start under Earlier, once tapped under Today. */
  open: boolean;
  /** One sentence per warning: outside today only under Today, over a week ago whichever was chosen. */
  warningLines: string[];
  futureReadAt: boolean;
  /** Date looks good may be pressed: the date is not still to come. */
  confirmable: boolean;
};

export type CaptureFormVerdict = {
  step: CaptureStep;
  parsed: number | null;
  /** The line under the hours input, once there is an estimate: its sentence, or the impossible sentence. */
  estimateLine: string | null;
  date: CaptureDateStep | null;
  /** Null until the details step; then the request the client posts. */
  request: CaptureRequest | null;
  /** Null exactly when `request` is. */
  answers: CaptureAnswers | null;
};

export const CAPTURE_VALUE_INVALID = 'Enter a non-negative value with at most one decimal place.';

/** A reading as typed, read as hours; null until it is a valid reading. A comma counts as the decimal point. */
export function parseCaptureValue(typed: string): number | null {
  const value = typed.trim() ? ReadingValue.safeParse(Number(typed.replace(',', '.'))) : null;
  return value?.success ? value.data : null;
}

const sameInstant = (left: Date | null, right: Date | null) => (left?.getTime() ?? null) === (right?.getTime() ?? null);

/** The date step for a reading of `parsed` hours with its `estimate`: the pick, else the estimate, else now. */
function captureDateStep(
  world: CaptureFormWorld,
  draft: CaptureDraft,
  estimate: Exclude<WireReadAtEstimate, { kind: 'impossible' }>,
): CaptureDateStep {
  const estimated = namesReadAt(estimate) ? new Date(estimate.readAt) : null;
  const locked = estimate.kind === 'telematics';
  const readAt = locked ? estimated : (draft.pickedReadAt ?? estimated);
  const source: CaptureDateSource = readAt === null ? 'now' : sameInstant(readAt, estimated) ? 'estimate' : 'picked';
  const futureReadAt = readAt !== null && isFutureReadAt(readAt, world.now);
  return {
    readAt,
    source,
    line:
      readAt === null
        ? 'Read now'
        : source === 'estimate'
          ? estimateSentence(estimate)
          : `Read on ${formatDate(readAt, 'medium')}`,
    locked,
    open: !locked && (draft.when === 'earlier' || draft.dateOpened),
    warningLines: [
      ...(readAt && draft.when === 'today' && toPlantDateOnly(readAt) !== toPlantDateOnly(world.now)
        ? [outsideTodaySentence(readAt)]
        : []),
      ...(readAt && isOverAWeekAgo(readAt, world.now) ? [overAWeekSentence(readAt)] : []),
    ],
    futureReadAt,
    confirmable: !futureReadAt,
  };
}

/**
 * The capture wizard: which step it is on, what the date step shows, and the request it posts once the person has
 * vouched for the date. The server's `judgeCapture` stays the safety net.
 */
export function deriveCaptureForm(world: CaptureFormWorld, draft: CaptureDraft): CaptureFormVerdict {
  const parsed = parseCaptureValue(draft.value);
  const estimate = parsed === null ? undefined : draft.estimate;
  const asked =
    draft.when !== null && parsed !== null && estimate !== undefined && estimate.kind !== 'impossible'
      ? { when: draft.when, parsed, estimate }
      : null;
  const date = asked ? captureDateStep(world, draft, asked.estimate) : null;
  const confirmed =
    parsed !== null &&
    draft.dateConfirmed?.value === parsed &&
    sameInstant(draft.dateConfirmed.readAt, date?.readAt ?? null);
  const step: CaptureStep =
    draft.when === null ? 'when' : !date ? 'hours' : date.confirmable && confirmed ? 'details' : 'date';
  const ready = step === 'details' && asked && date ? { ...asked, date } : null;
  return {
    step,
    parsed,
    estimateLine: estimate ? estimateSentence(estimate) : null,
    date,
    request: ready ? { value: ready.parsed, comment: draft.comment.trim() || null } : null,
    answers: ready
      ? { when: ready.when, estimateKind: ready.estimate.kind, dateEdited: ready.date.source === 'picked' }
      : null,
  };
}

/** Date looks good: the hours and the date the form shows, vouched for together. */
export const confirmCaptureDate = (verdict: CaptureFormVerdict): CaptureDateConfirmation | null =>
  verdict.parsed !== null && verdict.date?.confirmable ? { value: verdict.parsed, readAt: verdict.date.readAt } : null;

export const ESTIMATE_DEBOUNCE_MS = 300;
export const ESTIMATE_STALE_MS = 30_000;

/**
 * The estimate a form shows for the hours on screen: the answer only once it is for `value`, which `asked` reached
 * when typing stopped, so a value still being typed never borrows the last one's date.
 */
export function estimateOnScreen<TError>(
  value: number | null,
  asked: number | null,
  answer: { estimate: WireReadAtEstimate | undefined; fetching: boolean; error: TError | null },
) {
  const current = value !== null && asked === value;
  return {
    estimate: current ? answer.estimate : undefined,
    working: value !== null && (!current || answer.fetching),
    error: current ? answer.error : null,
  };
}
