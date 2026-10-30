import { type AssignmentAttentionKind, assignmentAttentionKinds } from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { isOverTravelFlag, johnDeereDifference } from './stint-hours.js';

export type AttentionThresholds = { travelFlagThresholdHours: number; johnDeereDifferenceThresholdHours: number };

type AttentionReading = { hours: number; telematics: { hours: number; at: string } | null } | null;

/** What a kind's sentence names: the stint's Travel and each Job Hours' John Deere snapshot. */
type AttentionFacts = {
  travelHours: number | null;
  travelClamped: boolean;
  arrival: AttentionReading;
  departure: AttentionReading;
};

/** What the kinds are read off: the sentence's facts, and whether Travel was set by hand. */
export type AttentionStint = AttentionFacts & { travelSet: boolean };

/** The larger difference from John Deere over the threshold on either of the stint's Job Hours, or null. */
export function johnDeereDifferenceOver(stint: AttentionFacts, threshold: number): number | null {
  const over = [stint.arrival, stint.departure].flatMap((reading) => {
    const difference = reading ? johnDeereDifference(reading.hours, reading.telematics, threshold) : null;
    return difference?.over ? [difference.hours] : [];
  });
  return over.length ? Math.max(...over) : null;
}

type AttentionKindRule = {
  label: string;
  /** Travel set by hand was looked at: neither Travel kind holds after it, the clamp being cleared by the set. */
  holds: (stint: AttentionStint, thresholds: AttentionThresholds) => boolean;
  /** The badge on the stint, naming its hours. */
  sentence: (stint: AttentionFacts, thresholds: AttentionThresholds) => string;
};

/** Assignment Attention has one level, needs a look: amber, counted and filtered for, and it blocks nothing. */
const attentionKindRules: Record<AssignmentAttentionKind, AttentionKindRule> = {
  'travel-over-threshold': {
    label: 'Travel over threshold',
    holds: (stint, { travelFlagThresholdHours }) =>
      !stint.travelSet && stint.travelHours !== null && isOverTravelFlag(stint.travelHours, travelFlagThresholdHours),
    sentence: (stint, { travelFlagThresholdHours }) =>
      `Travel ${formatHours(stint.travelHours ?? 0)} is over the ${formatHours(travelFlagThresholdHours)} threshold`,
  },
  'travel-clamped': {
    label: `Travel set to ${formatHours(0)}`,
    holds: (stint) => stint.travelClamped,
    sentence: (stint) =>
      `Travel set to ${formatHours(0)}: arrival ${formatHours(stint.arrival?.hours ?? 0)} is below the Machine's previous departure`,
  },
  'john-deere-difference': {
    label: 'John Deere differs',
    holds: (stint, { johnDeereDifferenceThresholdHours }) =>
      johnDeereDifferenceOver(stint, johnDeereDifferenceThresholdHours) !== null,
    sentence: (stint, { johnDeereDifferenceThresholdHours }) =>
      `John Deere differs by ${formatHours(johnDeereDifferenceOver(stint, johnDeereDifferenceThresholdHours) ?? 0)}`,
  },
};

export const assignmentAttentionKindLabel = (kind: AssignmentAttentionKind) => attentionKindRules[kind].label;

export const stintAttentionKinds = (stint: AttentionStint, thresholds: AttentionThresholds) =>
  assignmentAttentionKinds.filter((kind) => attentionKindRules[kind].holds(stint, thresholds));

export const assignmentAttentionSentence = (
  kind: AssignmentAttentionKind,
  stint: AttentionFacts,
  thresholds: AttentionThresholds,
) => attentionKindRules[kind].sentence(stint, thresholds);

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
