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
export type AmendableReading = ReadingDisputeState & { id: string; value: number };
export type ReadingAmendmentResolution =
  | { ok: false; reason: 'not_found' | 'out_of_range' }
  | { ok: true; changes: ({ id: string } & ReadingDisputeState)[] };

/**
 * Where an amended value lands in a Machine's ledger (`readings` ascending by Read At, ties by acceptance) and which
 * dispute pairs it settles. Amended hours must stay between the neighbouring readings. A pair settles
 * when the disputing reading is no longer below the one it disputes and the amended reading is one of
 * the two; pairs the amendment did not touch keep their flags. `changes` lists the amended reading and
 * every other reading whose dispute state moved, so the caller writes exactly those rows.
 */
export function resolveReadingAmendment(
  readings: readonly AmendableReading[],
  amendment: { id: string; value: number },
): ReadingAmendmentResolution {
  const index = readings.findIndex((reading) => reading.id === amendment.id);
  const before = readings[index];
  if (!before) return { ok: false, reason: 'not_found' };
  const previous = readings[index - 1];
  const next = readings[index + 1];
  // A reading John Deere contradicted is disputed with no pair: only a value back in sequence settles it.
  const disputedTargets = new Set(readings.flatMap((reading) => reading.disputedPreviousId ?? []));
  const standalone = (reading: AmendableReading) =>
    reading.disputed && !reading.disputedPreviousId && !disputedTargets.has(reading.id);
  if (
    (amendment.value !== before.value || standalone(before)) &&
    ((previous && amendment.value < previous.value) || (next && amendment.value > next.value))
  )
    return { ok: false, reason: 'out_of_range' };

  const values = new Map(
    readings.map((reading) => [reading.id, reading.id === amendment.id ? amendment.value : reading.value]),
  );
  const stillDisputed = new Set(
    readings.filter((reading) => reading.id !== amendment.id && standalone(reading)).map((reading) => reading.id),
  );
  const settledLinks = new Set<string>();
  for (const reading of readings) {
    if (!reading.disputedPreviousId) continue;
    const disputedValue = values.get(reading.disputedPreviousId);
    if (disputedValue === undefined) continue;
    const touched = reading.id === amendment.id || reading.disputedPreviousId === amendment.id;
    if (touched && (values.get(reading.id) ?? 0) >= disputedValue) settledLinks.add(reading.id);
    else {
      stillDisputed.add(reading.id);
      stillDisputed.add(reading.disputedPreviousId);
    }
  }

  const changes: ({ id: string } & ReadingDisputeState)[] = [];
  for (const reading of readings) {
    const disputed = stillDisputed.has(reading.id);
    const state: ReadingDisputeState = {
      disputed,
      disputeReason: disputed ? reading.disputeReason : null,
      disputedPreviousId: settledLinks.has(reading.id) ? null : reading.disputedPreviousId,
    };
    const unchanged =
      reading.disputed === state.disputed &&
      reading.disputeReason === state.disputeReason &&
      reading.disputedPreviousId === state.disputedPreviousId;
    if (reading.id !== amendment.id && unchanged) continue;
    changes.push({ id: reading.id, ...state });
  }
  return { ok: true, changes };
}
