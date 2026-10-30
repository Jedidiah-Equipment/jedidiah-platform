import type { FleetHistoryReadingRole, KnownHoursSource, TelematicsProvider } from '@pkg/schema/contracting';
import { formatDate } from '../formatting/date.js';
import { formatHours } from '../formatting/number.js';
import { getFirstName } from '../formatting/text.js';

export const readingRoleLabels: Record<FleetHistoryReadingRole, string> = {
  spot: 'Spot',
  arrival: 'Arrival',
  departure: 'Departure',
};

export const telematicsProviderLabels: Record<TelematicsProvider, string> = { 'john-deere': 'John Deere' };

/** What follows a reading on a line when its source is a machine's telematics: `' · John Deere'`, else nothing. */
export const readingProviderSuffix = (provider: TelematicsProvider | null): string =>
  provider ? ` · ${telematicsProviderLabels[provider]}` : '';

export const knownHoursSourceLabels: Record<KnownHoursSource, string> = {
  telematics: 'John Deere',
  spot: 'spot reading',
  job: 'Job',
};

/** What follows Known Hours on a line: `' · John Deere'`, `' · spot reading'` or `' · Job'`. */
export const knownHoursSourceSuffix = (source: KnownHoursSource | null): string =>
  source ? ` · ${knownHoursSourceLabels[source]}` : '';

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

/** What a Telematics Reading said, as a refusal names it. */
export const telematicsReportedSentence = (reported: {
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

/** Engine hours cannot pass faster than the clock; an hour of slack covers Deere's floor-to-tenth and phone clocks. */
export const CLOCK_TOLERANCE_HOURS = 1;

export const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / 3_600_000;

export type TimedValue = { value: number; capturedAt: Date };

/** Whether `later` shows more engine hours than could have passed since `earlier`. */
export const outrunsClock = (earlier: TimedValue, later: TimedValue): boolean =>
  later.value - earlier.value > hoursBetween(earlier.capturedAt, later.capturedAt) + CLOCK_TOLERANCE_HOURS;

/** "25.4 h of engine time cannot pass in 0.0 h of clock time since the reading of 1 232.8 h at 27 Oct 2026, 16:17." */
export function outrunsClockSentence(
  earlier: TimedValue,
  later: TimedValue,
  neighbour: TimedValue,
  side: 'since' | 'before',
): string {
  const engine = formatHours(later.value - earlier.value);
  const clock = formatHours(hoursBetween(earlier.capturedAt, later.capturedAt));
  const reading = `the reading of ${formatHours(neighbour.value)} at ${formatDate(neighbour.capturedAt, 'medium')}`;
  return `${engine} of engine time cannot pass in ${clock} of clock time ${side} ${reading}.`;
}
