import type { ReadingRole } from '@pkg/schema/contracting';
import { judgePlacement, type Misplacement, placementIn } from './capture.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';
import {
  contradictingTelematics,
  isReported,
  ledgerOrder,
  type ReadingDisputeState,
  type SequencedReading,
  telematicsDisputeReason,
} from './readings.js';

export type AmendableReading = ReadingDisputeState & SequencedReading & { role: ReadingRole };
/** A stint as its readings bound it; core reads them off machine_assignment, in any order. */
export type StintBounds = { assignmentId: string; arrivalId: string; departureId: string | null };
/** A stint with the Job it belongs to. */
export type JobStint = StintBounds & { jobId: string };
export type ReadingAmendmentRefusal =
  | 'not_found'
  | 'out_of_range'
  | 'contradicts_telematics'
  | 'out_of_order'
  | 'outruns_clock'
  | 'future_read_at';
export type ReadingAmendmentResolution =
  | { ok: false; reason: ReadingAmendmentRefusal; id: string; message: string }
  | { ok: true; changes: ({ id: string } & ReadingDisputeState)[] };
type Amendment = { id: string; value: number; capturedAt: Date };

/**
 * How a misplacement refuses an amendment: past a Telematics Reading on either side, even one a disputed reading
 * hides, it contradicts John Deere; outside a captured neighbour it is out of range; and the clock is its own rule.
 */
const amendmentRefusalFor = ({ rule, neighbour }: Misplacement): ReadingAmendmentRefusal =>
  rule === 'outruns-clock' ? 'outruns_clock' : isReported(neighbour) ? 'contradicts_telematics' : 'out_of_range';

/** An amendment is already the fix: outside a captured neighbour it says so plainly, and states the clock rule alone. */
const amendmentSentence = ({ rule, neighbour, sentence }: Misplacement) =>
  rule === 'outruns-clock' || isReported(neighbour)
    ? sentence
    : 'Amended hours must be between the neighbouring readings.';

/** A Machine's ledger as the amendments would leave it: amended values and Read Ats in place, in ledger order. */
function amendedLedger<T extends SequencedReading>(readings: readonly T[], amendments: readonly Amendment[]): T[] {
  const amended = new Map(amendments.map((amendment) => [amendment.id, amendment]));
  return readings
    .map((reading) => {
      const change = amended.get(reading.id);
      return change ? { ...reading, value: change.value, capturedAt: change.capturedAt } : reading;
    })
    .sort(ledgerOrder);
}

/**
 * Readings disputed on their own, with no pair: a Telematics Reading contradicted them. An amendment clears one only
 * when it names it, moved or not.
 */
function standaloneDisputes(
  readings: readonly Pick<AmendableReading, 'id' | 'disputed' | 'disputedPreviousId'>[],
): Set<string> {
  const disputedTargets = new Set(readings.flatMap((reading) => reading.disputedPreviousId ?? []));
  return new Set(
    readings
      .filter((reading) => reading.disputed && !reading.disputedPreviousId && !disputedTargets.has(reading.id))
      .map((reading) => reading.id),
  );
}

/**
 * What an amendment does to its reading. It `moves` the hours or Read At. Unchanged, it `settles` a reading John Deere
 * contradicted on its own, which only an amendment naming it can clear, or else `acknowledges` the evidence warning.
 * Only what moves or settles is judged; only what moves changes a Job's hours. A Dispute's resolve leaves out what
 * would only acknowledge, so an untouched reading of a pair is not stamped as amended.
 */
export type AmendmentEffect = 'moves' | 'settles' | 'acknowledges';

const instant = (at: Date | string) => new Date(at).getTime();

/** Each amendment's effect, by reading id; readings are as recorded, Read Ats a Date in core and ISO on the wire. */
export function amendmentEffects(
  readings: readonly (Pick<AmendableReading, 'id' | 'value' | 'disputed' | 'disputedPreviousId'> & {
    capturedAt: Date | string;
  })[],
  amendments: readonly { id: string; value: number; capturedAt: Date | string }[],
): Map<string, AmendmentEffect> {
  const recorded = new Map(readings.map((reading) => [reading.id, reading]));
  const standalone = standaloneDisputes(readings);
  return new Map(
    amendments.map(({ id, value, capturedAt }) => {
      const before = recorded.get(id);
      const moves = !before || before.value !== value || instant(before.capturedAt) !== instant(capturedAt);
      return [id, moves ? 'moves' : standalone.has(id) ? 'settles' : 'acknowledges'];
    }),
  );
}

/**
 * The Jobs a set of amendments touches. `moved` are those whose derived hours change: each stint a moved reading bounds
 * and, for a moved departure, the Machine's next stint, whose Hour Gap starts at it, found as the ledger stands and as
 * the amendments leave it, since a re-dated departure can change which stint is next. `bound` adds the Job of every
 * stint any amended reading bounds, which the Job gate judges whether or not its hours move.
 */
export function amendmentJobs(
  readings: readonly AmendableReading[],
  amendments: readonly Amendment[],
  stints: readonly JobStint[],
): { bound: Set<string>; moved: Set<string> } {
  const effects = amendmentEffects(readings, amendments);
  const movedIds = new Set([...effects].flatMap(([id, effect]) => (effect === 'moves' ? [id] : [])));
  const jobsBounding = (ids: ReadonlySet<string>) =>
    stints
      .filter((stint) => ids.has(stint.arrivalId) || (stint.departureId !== null && ids.has(stint.departureId)))
      .map((stint) => stint.jobId);
  const jobOfArrival = new Map(stints.map((stint) => [stint.arrivalId, stint.jobId]));
  const nextStintJobs = [[...readings].sort(ledgerOrder), amendedLedger(readings, amendments)].flatMap((ledger) =>
    ledger.flatMap((reading, index) => {
      if (reading.role !== 'departure' || !movedIds.has(reading.id)) return [];
      const nextArrival = ledger.slice(index + 1).find((candidate) => jobOfArrival.has(candidate.id));
      const jobId = nextArrival && jobOfArrival.get(nextArrival.id);
      return jobId ? [jobId] : [];
    }),
  );
  const moved = new Set([...jobsBounding(movedIds), ...nextStintJobs]);
  return { bound: new Set([...jobsBounding(new Set(effects.keys())), ...moved]), moved };
}

/**
 * Whether a set of amendments may land on a Machine's ledger (`readings`, any order), and the dispute state it leaves.
 * Each amended reading that moves or settles is judged again as a fresh capture at its new place in time, in the
 * capture rules' order: never in the future, then every stint it bounds still in time order, then the placement judge.
 * An amendment that only acknowledges the evidence warning is not judged again.
 */
export function resolveReadingAmendments(
  readings: readonly AmendableReading[],
  amendments: readonly Amendment[],
  stints: readonly StintBounds[],
  now: Date,
): ReadingAmendmentResolution {
  const refuse = (reason: ReadingAmendmentRefusal, id: string, message: string) =>
    ({ ok: false, reason, id, message }) as const;
  const known = new Set(readings.map((reading) => reading.id));
  const missing = amendments.find((amendment) => !known.has(amendment.id));
  if (missing) return refuse('not_found', missing.id, 'Hour Reading not found.');
  const effects = amendmentEffects(readings, amendments);
  const amended = new Set(effects.keys());
  const ledger = amendedLedger(readings, amendments);
  const judged = [...ledger.entries()].filter(([, reading]) => {
    const effect = effects.get(reading.id);
    return effect === 'moves' || effect === 'settles';
  });
  const future = judged.find(([, reading]) => isFutureReadAt(reading.capturedAt, now));
  if (future) return refuse('future_read_at', future[1].id, FUTURE_READ_AT_REFUSAL);
  const disorder = stintOutOfOrder(readings, ledger, stints, amended);
  if (disorder)
    return refuse(
      'out_of_order',
      disorder,
      "Stints stay in time order: an arrival after the Machine's previous departure, a departure after its own arrival and before the next arrival.",
    );
  for (const [index, reading] of judged) {
    const misplaced = judgePlacement(placementIn(ledger, index), reading);
    if (misplaced) return refuse(amendmentRefusalFor(misplaced), reading.id, amendmentSentence(misplaced));
  }
  return { ok: true, changes: disputeChanges(readings, ledger, amended) };
}

/**
 * The amended reading that breaks stint order, or null: walking the stints as they stood, each arrival at or after
 * the previous stint's departure and each departure at or after its own arrival. Order nobody moved is not judged.
 */
function stintOutOfOrder(
  readings: readonly SequencedReading[],
  ledger: readonly SequencedReading[],
  stints: readonly StintBounds[],
  amended: ReadonlySet<string>,
): string | null {
  const position = new Map([...readings].sort(ledgerOrder).map((reading, index) => [reading.id, index]));
  const at = new Map(ledger.map((reading) => [reading.id, reading]));
  const breaks = (earlier: SequencedReading, later: SequencedReading) =>
    ledgerOrder(later, earlier) < 0 && (amended.has(earlier.id) || amended.has(later.id));
  const culprit = (earlier: SequencedReading, later: SequencedReading) =>
    amended.has(later.id) ? later.id : earlier.id;
  let lastDeparture: SequencedReading | null = null;
  for (const stint of [...stints].sort(
    (left, right) => (position.get(left.arrivalId) ?? 0) - (position.get(right.arrivalId) ?? 0),
  )) {
    const arrival = at.get(stint.arrivalId);
    if (!arrival) continue;
    const departure = stint.departureId ? at.get(stint.departureId) : undefined;
    if (lastDeparture && breaks(lastDeparture, arrival)) return culprit(lastDeparture, arrival);
    if (departure && breaks(arrival, departure)) return culprit(arrival, departure);
    lastDeparture = departure ?? lastDeparture;
  }
  return null;
}

/** Two readings are in sequence when the earlier in the ledger reads no higher than the later. */
const inSequence = (left: SequencedReading, right: SequencedReading) =>
  ledgerOrder(left, right) < 0 ? left.value <= right.value : right.value <= left.value;

/**
 * Dispute state over the ledger as it would stand. A pair settles once its two readings are in sequence and an
 * amendment touched one of them; pairs no amendment touched keep their flags. A reading a Telematics Reading
 * contradicts is Disputed with that report's sentence, so one whose move clears the contradiction settles. Lists the
 * amended readings and every reading whose state moved, so the caller writes exactly those rows.
 */
function disputeChanges(
  before: readonly AmendableReading[],
  ledger: readonly AmendableReading[],
  amended: ReadonlySet<string>,
): ({ id: string } & ReadingDisputeState)[] {
  const at = new Map(ledger.map((reading) => [reading.id, reading]));
  const stillDisputed = new Set([...standaloneDisputes(before)].filter((id) => !amended.has(id)));
  const settledLinks = new Set<string>();
  for (const reading of ledger) {
    const disputedPrevious = reading.disputedPreviousId ? at.get(reading.disputedPreviousId) : undefined;
    if (!disputedPrevious) continue;
    const touched = amended.has(reading.id) || amended.has(disputedPrevious.id);
    if (touched && inSequence(reading, disputedPrevious)) settledLinks.add(reading.id);
    else {
      stillDisputed.add(reading.id);
      stillDisputed.add(disputedPrevious.id);
    }
  }
  const changes: ({ id: string } & ReadingDisputeState)[] = [];
  for (const reading of before) {
    const paired = stillDisputed.has(reading.id);
    const reported = paired ? null : contradictingTelematics(ledger, [reading.id]);
    const state: ReadingDisputeState = {
      disputed: paired || reported !== null,
      disputeReason: reported ? telematicsDisputeReason(reported) : paired ? reading.disputeReason : null,
      disputedPreviousId: settledLinks.has(reading.id) ? null : reading.disputedPreviousId,
    };
    const unchanged =
      reading.disputed === state.disputed &&
      reading.disputeReason === state.disputeReason &&
      reading.disputedPreviousId === state.disputedPreviousId;
    if (amended.has(reading.id) || !unchanged) changes.push({ id: reading.id, ...state });
  }
  return changes;
}
