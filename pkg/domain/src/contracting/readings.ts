import {
  type AiFlaggedVerification,
  aiFlaggedVerifications,
  type JobReadingAttentionKind,
  type NeedsALookLevel,
  type ReadingExceptionType,
  type ReadingRole,
  type ReadingVerification,
  type TelematicsProvider,
} from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import {
  aiVerificationLevel,
  assignmentAttentionKindLevels,
  loudestNeedingALook,
  needsALook,
} from './assignment-attention.js';
import { FUTURE_READ_AT_REFUSAL, isFutureReadAt } from './read-at.js';

export const readingRoleLabels: Record<ReadingRole, string> = {
  baseline: 'Baseline',
  spot: 'Spot',
  arrival: 'Arrival',
  departure: 'Departure',
};

/** How often a screen showing a reading whose AI check is still running asks again. */
export const AI_VERDICT_POLL_MS = 5_000;
/** A check takes seconds; past this a pending reading is a failed check waiting on Re-verify, so screens stop asking. */
export const AI_VERDICT_POLL_LIMIT_MS = 120_000;

/** The stamp on a reading captured without a photo. */
export const MISSING_PHOTO_EVIDENCE = 'Missing Photo Evidence';

export const telematicsProviderLabels: Record<TelematicsProvider, string> = { 'john-deere': 'John Deere' };

/** What follows a reading on a line when its source is a machine's telematics: `' · John Deere'`, else nothing. */
export const readingProviderSuffix = (provider: TelematicsProvider | null): string =>
  provider ? ` · ${telematicsProviderLabels[provider]}` : '';

/** What a ledger row says about its evidence: the provider for a Telematics Reading, which has no photo to miss. */
export const readingEvidenceCaption = (reading: {
  telematicsProvider: TelematicsProvider | null;
  photoBacked: boolean;
}): string =>
  reading.telematicsProvider
    ? telematicsProviderLabels[reading.telematicsProvider]
    : reading.photoBacked
      ? 'Photo-backed'
      : MISSING_PHOTO_EVIDENCE;

export type ReadingEvidenceState =
  | { state: 'no-photo' | 'pending' | 'unreadable' }
  | { state: 'low-confidence' | 'disagrees' | 'agrees'; aiValue: number };

/** What the AI made of the meter photo, as `readingVerification` can store it. */
export function readingEvidenceState(reading: {
  photoBacked: boolean;
  aiValue: number | null;
  aiVerification: ReadingVerification;
}): ReadingEvidenceState {
  if (!reading.photoBacked) return { state: 'no-photo' };
  if (reading.aiVerification === 'pending') return { state: 'pending' };
  if (reading.aiValue === null) return { state: 'unreadable' };
  if (reading.aiVerification === 'low-confidence') return { state: 'low-confidence', aiValue: reading.aiValue };
  if (reading.aiVerification === 'disagrees') return { state: 'disagrees', aiValue: reading.aiValue };
  return { state: 'agrees', aiValue: reading.aiValue };
}

/** How a list of readings labels each evidence state: the stint card, the Reading Exceptions list and History. */
export const readingEvidenceLabels: Record<ReadingEvidenceState['state'], string> = {
  'no-photo': MISSING_PHOTO_EVIDENCE,
  pending: 'Photo-backed · Verification pending',
  unreadable: 'Photo-backed',
  'low-confidence': 'Photo-backed · Low extraction confidence',
  disagrees: 'Photo-backed · Extracted value differs',
  agrees: 'Photo-backed · AI-verified',
};

/** A ledger row's evidence: who reported a Telematics Reading, else what the AI made of the photo. */
export const readingEvidenceLabel = (
  reading: Parameters<typeof readingEvidenceState>[0] & { telematicsProvider: TelematicsProvider | null },
): string =>
  reading.telematicsProvider
    ? telematicsProviderLabels[reading.telematicsProvider]
    : readingEvidenceLabels[readingEvidenceState(reading).state];

export const readingExceptionTypeLabels = {
  'ai-flagged': 'AI flagged',
  disputed: 'Disputed',
} as const;

/** The API route that captures an Hour Reading, relative to the API origin. */
export const READING_CAPTURE_PATH = '/api/contracting/readings';

/** The API route that serves an Hour Reading's meter photo, relative to the API origin. */
export const readingPhotoPath = (readingId: string) => `${READING_CAPTURE_PATH}/${encodeURIComponent(readingId)}/photo`;

export const isAiFlaggedVerification = (verification: ReadingVerification): verification is AiFlaggedVerification =>
  (aiFlaggedVerifications as readonly ReadingVerification[]).includes(verification);

// Below 80% remains a management exception even when the digits happen to agree.
export const METER_CONFIDENCE_THRESHOLD = 0.8;

export function readingVerification(
  value: number,
  aiValue: number | null,
  aiConfidence: number | null,
): 'pending' | 'low-confidence' | 'agrees' | 'disagrees' {
  if (aiConfidence === null) return 'pending';
  if (aiValue === null || aiConfidence < METER_CONFIDENCE_THRESHOLD) return 'low-confidence';
  return Math.round(value * 10) === Math.round(aiValue * 10) ? 'agrees' : 'disagrees';
}

export type ReadingAttentionFacts = {
  disputed: boolean;
  aiVerification: ReadingVerification;
  /** Null until the evidence has been reviewed: a Date in core, an ISO string on the wire. */
  evidenceReviewedAt: Date | string | null;
};

/** Why an Hour Reading needs a look: it is disputed, or the AI could not confirm it and nobody has reviewed it. */
export function readingAttention(reading: ReadingAttentionFacts): {
  disputed: boolean;
  aiFlagged: AiFlaggedVerification | null;
} {
  return {
    disputed: reading.disputed,
    aiFlagged:
      reading.evidenceReviewedAt === null && isAiFlaggedVerification(reading.aiVerification)
        ? reading.aiVerification
        : null,
  };
}

/** Each attention kind on a reading, notices included; a reading without a photo carries `missing-photo`. */
export function readingAttentionKinds(
  reading: ReadingAttentionFacts & { photoBacked: boolean },
): JobReadingAttentionKind[] {
  const { disputed, aiFlagged } = readingAttention(reading);
  return [
    ...(disputed ? (['disputed'] as const) : []),
    ...(aiFlagged ? ([`ai-${aiFlagged}`] as const) : []),
    ...(reading.photoBacked ? [] : (['missing-photo'] as const)),
  ];
}

/** The loudest level on a reading that needs a look, or null when nothing does. Core's SQL twins this. */
export const readingNeedsALookLevel = (reading: ReadingAttentionFacts): NeedsALookLevel | null =>
  loudestNeedingALook(
    readingAttentionKinds({ ...reading, photoBacked: true }).map((kind) => assignmentAttentionKindLevels[kind]),
  );

export const readingNeedsALook = (reading: ReadingAttentionFacts): boolean => readingNeedsALookLevel(reading) !== null;

/** Why a reading is on the Reading Exceptions list: only the kinds that need a look. */
export function readingExceptionTypes(reading: ReadingAttentionFacts): ReadingExceptionType[] {
  const { disputed, aiFlagged } = readingAttention(reading);
  return [
    ...(disputed ? (['disputed'] as const) : []),
    ...(aiFlagged && needsALook(aiVerificationLevel(aiFlagged)) ? (['ai-flagged'] as const) : []),
  ];
}

/** The attention a reading's row shows: an amendment settles its notices, so only what still needs a look stays. */
export const shownReadingAttention = (reading: {
  amendedAt: string | null;
  attention: readonly JobReadingAttentionKind[];
}): readonly JobReadingAttentionKind[] =>
  reading.amendedAt === null
    ? reading.attention
    : reading.attention.filter((kind) => needsALook(assignmentAttentionKindLevels[kind]));

/** An amendment that acknowledged the current AI finding is the latest word on a reading; a re-verify reopens it. */
export const amendmentSettledFinding = (reading: { amendedAt: string | null; evidenceReviewedAt: string | null }) =>
  reading.amendedAt !== null && reading.evidenceReviewedAt !== null;

export function meterDisagreementHint({
  value,
  aiValue,
  aiVerification,
}: {
  value: number;
  aiValue: number | null;
  aiVerification: string;
}): string | null {
  if (aiVerification !== 'disagrees' || !aiValue || !value) return null;
  const ratio = aiValue / value;
  return (ratio >= 9 && ratio <= 11) || (ratio >= 0.09 && ratio <= 0.11)
    ? 'Possible tenths-drum misread (≈10× / 0.1×).'
    : null;
}

/** Why a captured reading is Disputed against a Telematics Reading. */
export const telematicsDisputeReason = (reported: {
  telematicsProvider: TelematicsProvider;
  value: number;
  capturedAt: Date;
}) =>
  `${telematicsProviderLabels[reported.telematicsProvider]} reported ${formatHours(reported.value)} at ${formatDate(reported.capturedAt, 'medium')}.`;

/** A reading at its place in the ledger: Read At, then acceptance. */
export type SequencedReading = {
  id: string;
  telematicsProvider: TelematicsProvider | null;
  value: number;
  capturedAt: Date;
  sequence: number;
};

/** A Telematics Reading as the ledger holds it: one with a provider. */
export type ReportedReading<T extends SequencedReading = SequencedReading> = T & {
  telematicsProvider: TelematicsProvider;
};

const isReported = <T extends SequencedReading>(reading: T): reading is ReportedReading<T> =>
  reading.telematicsProvider !== null;

const ledgerOrder = (left: SequencedReading, right: SequencedReading) =>
  left.capturedAt.getTime() - right.capturedAt.getTime() || left.sequence - right.sequence;

/**
 * The one rule a Telematics Reading holds a captured reading to: the earlier of the two in the ledger may not read
 * higher. A captured reading that does is out of sequence, and the report is the one beyond dispute.
 */
const contradicts = (captured: SequencedReading, reported: SequencedReading) =>
  ledgerOrder(captured, reported) < 0 ? captured.value > reported.value : captured.value < reported.value;

/** The captured readings a Telematics Reading leaves out of sequence, in ledger order. */
export function readingsContradictedBy<T extends SequencedReading>(readings: readonly T[], reportedId: string): T[] {
  const reported = readings.find((candidate) => candidate.id === reportedId);
  if (!reported || !isReported(reported)) return [];
  return readings.filter((captured) => !isReported(captured) && contradicts(captured, reported)).sort(ledgerOrder);
}

/** The nearest Telematics Reading a captured reading is out of sequence with, or null. */
export function contradictingTelematics<T extends SequencedReading>(
  readings: readonly T[],
  id: string,
): ReportedReading<T> | null {
  const captured = readings.find((candidate) => candidate.id === id);
  if (!captured || isReported(captured)) return null;
  const distance = (reported: SequencedReading) =>
    Math.abs(reported.capturedAt.getTime() - captured.capturedAt.getTime());
  return (
    readings
      .filter(isReported)
      .filter((reported) => contradicts(captured, reported))
      .sort((left, right) => distance(left) - distance(right))[0] ?? null
  );
}

export type ReadingDisputeState = {
  disputed: boolean;
  disputeReason: string | null;
  disputedPreviousId: string | null;
};

/** Engine hours cannot pass faster than the clock; an hour of slack covers Deere's floor-to-tenth and phone clocks. */
export const CLOCK_TOLERANCE_HOURS = 1;

export const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

export type TimedValue = { value: number; capturedAt: Date };

/** Whether `later` shows more engine hours than could have passed since `earlier`. */
export const outrunsClock = (earlier: TimedValue, later: TimedValue): boolean =>
  later.value - earlier.value > hoursBetween(earlier.capturedAt, later.capturedAt) + CLOCK_TOLERANCE_HOURS;

/** "25.4 h of engine time cannot pass in 0.0 h of clock time since the arrival reading of 1 232.8 h at 27 Oct 2026, 16:17." */
export function outrunsClockSentence(
  earlier: TimedValue,
  later: TimedValue,
  neighbour: TimedValue & { role: ReadingRole },
  side: 'since' | 'before',
): string {
  const engine = formatHours(later.value - earlier.value);
  const clock = formatHours(hoursBetween(earlier.capturedAt, later.capturedAt));
  const reading = `the ${readingRoleLabels[neighbour.role].toLowerCase()} reading of ${formatHours(neighbour.value)} at ${formatDate(neighbour.capturedAt, 'medium')}`;
  return `${engine} of engine time cannot pass in ${clock} of clock time ${side} ${reading}.`;
}

export type AmendableReading = ReadingDisputeState & SequencedReading & { role: ReadingRole };
/** A stint as its readings bound it; core reads them off machine_assignment, in any order. */
export type StintBounds = { assignmentId: string; arrivalId: string; departureId: string | null };
export type ReadingAmendmentRefusal =
  | 'not_found'
  | 'out_of_range'
  | 'out_of_order'
  | 'outruns_clock'
  | 'future_read_at';
export type ReadingAmendmentResolution =
  | { ok: false; reason: ReadingAmendmentRefusal; id: string; message: string }
  | { ok: true; changes: ({ id: string } & ReadingDisputeState)[] };
type Amendment = { id: string; value: number; capturedAt: Date };

/** A Machine's ledger as the amendments would leave it: amended values and Read Ats in place, in ledger order. */
export function amendedLedger<T extends SequencedReading>(
  readings: readonly T[],
  amendments: readonly Amendment[],
): T[] {
  const amended = new Map(amendments.map((amendment) => [amendment.id, amendment]));
  return readings
    .map((reading) => {
      const change = amended.get(reading.id);
      return change ? { ...reading, value: change.value, capturedAt: change.capturedAt } : reading;
    })
    .sort(ledgerOrder);
}

/** Readings disputed on their own, with no pair: a Telematics Reading contradicted them. */
function standaloneDisputes(readings: readonly AmendableReading[]): Set<string> {
  const disputedTargets = new Set(readings.flatMap((reading) => reading.disputedPreviousId ?? []));
  return new Set(
    readings
      .filter((reading) => reading.disputed && !reading.disputedPreviousId && !disputedTargets.has(reading.id))
      .map((reading) => reading.id),
  );
}

/**
 * Whether a set of amendments may land on a Machine's ledger (`readings`, any order), and the dispute state it leaves.
 * Each amended reading that moved is judged again at its new place in time: never in the future, between its new
 * neighbours, contradicting no Telematics Reading, not outrunning the clock against either neighbour, and every stint
 * it bounds still in time order. An amendment that moves nothing acknowledges the evidence warning and is not judged
 * again, unless it is the only way to settle a reading John Deere contradicted.
 */
export function resolveReadingAmendments(
  readings: readonly AmendableReading[],
  amendments: readonly Amendment[],
  stints: readonly StintBounds[],
  now: Date,
): ReadingAmendmentResolution {
  const refuse = (reason: ReadingAmendmentRefusal, id: string, message: string) =>
    ({ ok: false, reason, id, message }) as const;
  const original = new Map(readings.map((reading) => [reading.id, reading]));
  const missing = amendments.find((amendment) => !original.has(amendment.id));
  if (missing) return refuse('not_found', missing.id, 'Hour Reading not found.');
  const amended = new Set(amendments.map((amendment) => amendment.id));
  const standalone = standaloneDisputes(readings);
  const ledger = amendedLedger(readings, amendments);
  for (const [index, reading] of ledger.entries()) {
    const before = original.get(reading.id);
    if (!before || !amended.has(reading.id)) continue;
    const moved = reading.value !== before.value || reading.capturedAt.getTime() !== before.capturedAt.getTime();
    if (!moved && !standalone.has(reading.id)) continue;
    if (isFutureReadAt(reading.capturedAt, now)) return refuse('future_read_at', reading.id, FUTURE_READ_AT_REFUSAL);
    const previous = ledger[index - 1];
    const next = ledger[index + 1];
    if ((previous && reading.value < previous.value) || (next && reading.value > next.value))
      return refuse('out_of_range', reading.id, 'Amended hours must be between the neighbouring readings.');
    // A disputed reading between them can hide a report the amended reading would still contradict.
    const reported = contradictingTelematics(ledger, reading.id);
    if (reported)
      return refuse('out_of_range', reading.id, `${telematicsDisputeReason(reported)} Check the time or the value.`);
    if (previous && outrunsClock(previous, reading))
      return refuse('outruns_clock', reading.id, outrunsClockSentence(previous, reading, previous, 'since'));
    if (next && outrunsClock(reading, next))
      return refuse('outruns_clock', reading.id, outrunsClockSentence(reading, next, next, 'before'));
  }
  const disorder = stintOutOfOrder(readings, ledger, stints, amended);
  if (disorder)
    return refuse(
      'out_of_order',
      disorder,
      "Stints stay in time order: an arrival after the Machine's previous departure, a departure after its own arrival and before the next arrival.",
    );
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
    const reported = paired ? null : contradictingTelematics(ledger, reading.id);
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
