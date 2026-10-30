import type {
  JobReadingAttentionKind,
  NeedsALookLevel,
  ReadingRole,
  TelematicsProvider,
} from '@pkg/schema/contracting';
import { groupBy } from '../collections/group-by.js';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { getFirstName } from '../formatting/text.js';

export const readingRoleLabels: Record<ReadingRole, string> = {
  baseline: 'Baseline',
  spot: 'Spot',
  arrival: 'Arrival',
  departure: 'Departure',
};

export const telematicsProviderLabels: Record<TelematicsProvider, string> = { 'john-deere': 'John Deere' };

/** What follows a reading on a line when its source is a machine's telematics: `' · John Deere'`, else nothing. */
export const readingProviderSuffix = (provider: TelematicsProvider | null): string =>
  provider ? ` · ${telematicsProviderLabels[provider]}` : '';

/** Where a reading's hours came from: who reported a Telematics Reading, else the capturer's first name. */
export const readingSourceLabel = (reading: {
  telematicsProvider: TelematicsProvider | null;
  capturedByName: string | null;
}): string | null =>
  reading.telematicsProvider
    ? telematicsProviderLabels[reading.telematicsProvider]
    : reading.capturedByName && getFirstName(reading.capturedByName);

/** The API route that captures an Hour Reading, relative to the API origin. */
export const READING_CAPTURE_PATH = '/api/contracting/readings';

export type ReadingAttentionFacts = { disputed: boolean };

/** Each attention kind on a reading: a Disputed one needs a look. */
export const readingAttentionKinds = (reading: ReadingAttentionFacts): JobReadingAttentionKind[] =>
  reading.disputed ? ['disputed'] : [];

/** The level a reading needs a look at, or null when it does not. */
export const readingNeedsALookLevel = (reading: ReadingAttentionFacts): NeedsALookLevel | null =>
  reading.disputed ? 'critical' : null;

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
