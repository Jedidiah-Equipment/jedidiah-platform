import type { AssignmentAttentionKind } from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { isOverTravelFlag, johnDeereDifference } from './stint-hours.js';

/*
 * Assignment Attention has one level, needs a look: amber, counted and filtered for, and it blocks nothing.
 */

export const assignmentAttentionKindLabels: Record<AssignmentAttentionKind, string> = {
  'travel-over-threshold': 'Travel over threshold',
  'travel-clamped': 'Travel set to 0 h',
  'john-deere-difference': 'John Deere differs',
};

export type AttentionThresholds = { travelFlagThresholdHours: number; johnDeereDifferenceThresholdHours: number };

type AttentionReading = { hours: number; telematics: { hours: number; at: string } | null } | null;

/** What the kinds are read off: the stint's Travel and the John Deere snapshot beside each of its Job Hours. */
export type AttentionStint = {
  travelHours: number | null;
  travelClamped: boolean;
  arrival: AttentionReading;
  departure: AttentionReading;
};

/** The larger difference from John Deere over the threshold on either of the stint's Job Hours, or null. */
export function johnDeereDifferenceOver(stint: AttentionStint, threshold: number): number | null {
  const over = [stint.arrival, stint.departure].flatMap((reading) => {
    const difference = reading ? johnDeereDifference(reading.hours, reading.telematics, threshold) : null;
    return difference?.over ? [difference.hours] : [];
  });
  return over.length ? Math.max(...over) : null;
}

/** Every reason a Machine Assignment needs a look. */
export function stintAttentionKinds(stint: AttentionStint, thresholds: AttentionThresholds): AssignmentAttentionKind[] {
  return [
    ...(stint.travelHours !== null && isOverTravelFlag(stint.travelHours, thresholds.travelFlagThresholdHours)
      ? (['travel-over-threshold'] as const)
      : []),
    ...(stint.travelClamped ? (['travel-clamped'] as const) : []),
    ...(johnDeereDifferenceOver(stint, thresholds.johnDeereDifferenceThresholdHours) !== null
      ? (['john-deere-difference'] as const)
      : []),
  ];
}

/** The badge a kind shows on the stint, naming its hours: "John Deere differs by 32.0 h". */
export function assignmentAttentionSentence(
  kind: AssignmentAttentionKind,
  stint: AttentionStint,
  thresholds: AttentionThresholds,
): string {
  switch (kind) {
    case 'travel-over-threshold':
      return `Travel ${formatHours(stint.travelHours ?? 0)} is over the ${formatHours(thresholds.travelFlagThresholdHours)} threshold`;
    case 'travel-clamped':
      return `Travel set to 0 h: arrival ${formatHours(stint.arrival?.hours ?? 0)} is below the Machine's previous departure`;
    case 'john-deere-difference':
      return `John Deere differs by ${formatHours(johnDeereDifferenceOver(stint, thresholds.johnDeereDifferenceThresholdHours) ?? 0)}`;
  }
}

/** How many of a Job's stints need a look. */
export const jobNeedsALookCount = (stints: readonly { attention: readonly AssignmentAttentionKind[] }[]) =>
  stints.filter((stint) => stint.attention.length > 0).length;

/** Every class an attention surface paints with: chip, text, dot, a bare icon, a card border, and an icon button. */
export type AssignmentAttentionColorClassNames = BadgeColorClassNames & {
  dot: string;
  icon: string;
  border: string;
  button: string;
};

/** The one amber set needs a look paints with, on every contracting surface. */
export const needsALookColorClassNames: AssignmentAttentionColorClassNames = {
  ...statusBadgeColorClassNames.orange,
  icon: 'text-orange-500',
  border: 'border-orange-500/60',
  button:
    'border-orange-500/50 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 dark:border-orange-500/50 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25',
};
