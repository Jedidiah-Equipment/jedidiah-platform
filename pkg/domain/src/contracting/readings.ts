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
import { groupBy } from '../collections/group-by.js';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import {
  aiVerificationLevel,
  assignmentAttentionKindLevels,
  loudestNeedingALook,
  needsALook,
} from './assignment-attention.js';

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

type Sourced = { telematicsProvider: TelematicsProvider | null };

/** A Telematics Reading: one with a provider. */
export type ReportedReading<T extends Sourced = SequencedReading> = T & { telematicsProvider: TelematicsProvider };

export const isReported = <T extends Sourced>(reading: T): reading is ReportedReading<T> =>
  reading.telematicsProvider !== null;

/** Ledger order: Read At, then acceptance. */
export const ledgerOrder = (left: SequencedReading, right: SequencedReading) =>
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

/**
 * The nearest Telematics Reading any of these captured readings is out of sequence with, or null: one reading's, or a
 * Dispute's, whose readings all sit in `readings`.
 */
export function contradictingTelematics<T extends SequencedReading>(
  readings: readonly T[],
  ids: readonly string[],
): ReportedReading<T> | null {
  const captured = readings.filter((reading) => ids.includes(reading.id) && !isReported(reading));
  if (!captured.length) return null;
  const reports = readings.filter(isReported);
  const contradictions = captured.flatMap((reading) =>
    reports
      .filter((reported) => contradicts(reading, reported))
      .map((reported) => ({
        reported,
        distance: Math.abs(reported.capturedAt.getTime() - reading.capturedAt.getTime()),
      })),
  );
  return contradictions.sort((left, right) => left.distance - right.distance)[0]?.reported ?? null;
}

/** `25 Oct 2026, 15:03 → 26 Oct 2026, 11:40`, or `→ open` while the Machine is still on site. */
export const stintWindowLabel = ({ arrivedAt, departedAt }: { arrivedAt: string | null; departedAt: string | null }) =>
  `${arrivedAt ? formatDate(arrivedAt, 'medium') : '—'} → ${departedAt ? formatDate(departedAt, 'medium') : 'open'}`;

/** The dispute reason a capture asserting the previous reading is wrong stores on itself. */
export const PREVIOUS_READING_WRONG = 'The previous reading is wrong.';
/** The dispute reason that capture stores on the reading it disputes. */
export const NEXT_CAPTURE_DISPUTES = 'The next capture disputes this reading.';

export type DisputeMember = SequencedReading & {
  disputed: boolean;
  disputedPreviousId: string | null;
  /** The stint this arrival or departure bounds; null for a spot reading. */
  assignmentId: string | null;
};

/**
 * Disputed readings in connected groups, each a Dispute: a pair joined by "the previous reading is wrong", plus any
 * Disputed reading sharing a stint with one of them. Each group in ledger order; groups newest first by their first
 * reading.
 */
export function groupDisputes<T extends DisputeMember>(readings: readonly T[]): [T, ...T[]][] {
  const disputed = readings.filter((reading) => reading.disputed).sort(ledgerOrder);
  const parent = new Map(disputed.map((reading) => [reading.id, reading.id]));
  const find = (id: string): string => {
    const up = parent.get(id) ?? id;
    return up === id ? id : find(up);
  };
  const union = (left: string, right: string) => {
    if (parent.has(left) && parent.has(right)) parent.set(find(left), find(right));
  };
  const firstOnStint = new Map<string, string>();
  for (const reading of disputed) {
    if (reading.disputedPreviousId) union(reading.id, reading.disputedPreviousId);
    if (!reading.assignmentId) continue;
    const first = firstOnStint.get(reading.assignmentId);
    if (first) union(reading.id, first);
    else firstOnStint.set(reading.assignmentId, reading.id);
  }
  return [...groupBy(disputed, (reading) => find(reading.id)).values()].sort((left, right) =>
    ledgerOrder(right[0], left[0]),
  );
}

/** Why a Disputed reading stands: the sentence it was flagged with, else what its link, where known, says it is. */
export const disputedReadingReason = (reading: { disputeReason: string | null; disputedPreviousId?: string | null }) =>
  reading.disputeReason ?? (reading.disputedPreviousId ? PREVIOUS_READING_WRONG : NEXT_CAPTURE_DISPUTES);

type ReasonedMember = DisputeMember & { disputeReason: string | null };

/**
 * Why a Dispute stands, read off its shape: what John Deere reported when it contradicts one, else the pair's
 * "the previous reading is wrong", else what its one reading was flagged with.
 */
export function disputeGroupReason(
  group: readonly [ReasonedMember, ...ReasonedMember[]],
  reported: ReportedReading | null,
): string {
  if (reported) return telematicsDisputeReason(reported);
  return group.some((reading) => reading.disputedPreviousId) ? PREVIOUS_READING_WRONG : disputedReadingReason(group[0]);
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
