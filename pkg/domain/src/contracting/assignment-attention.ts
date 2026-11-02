import {
  type AssignmentAttentionKind,
  assignmentAttentionKinds,
  type DismissedAttention,
} from '@pkg/schema/contracting';
import { formatHours } from '../formatting/number.js';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';
import { JD_LINK_LABEL } from './john-deere.js';
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

/** The stored Assignment columns the kinds read, as a write sees them before and after. */
export type AttentionFactsRow = {
  arrivalHours: number | null;
  departureHours: number | null;
  arrivalTelematicsHours: number | null;
  departureTelematicsHours: number | null;
  travelHours: number | null;
  travelClamped: boolean;
};

type AttentionKindRule = {
  label: string;
  /** Travel set by hand was looked at: neither Travel kind holds after it, the clamp being cleared by the set. */
  holds: (stint: AttentionStint, thresholds: AttentionThresholds) => boolean;
  /** The badge on the stint, naming its hours. */
  sentence: (stint: AttentionFacts, thresholds: AttentionThresholds) => string;
  /** The columns the kind reads: when any of them changes, a dismissal of the kind no longer stands. */
  facts: (row: AttentionFactsRow) => readonly unknown[];
};

/** Assignment Attention has one level, needs a look: amber, counted and filtered for, and it blocks nothing. */
const attentionKindRules: Record<AssignmentAttentionKind, AttentionKindRule> = {
  'travel-over-threshold': {
    label: 'Travel over threshold',
    holds: (stint, { travelFlagThresholdHours }) =>
      !stint.travelSet && stint.travelHours !== null && isOverTravelFlag(stint.travelHours, travelFlagThresholdHours),
    sentence: (stint, { travelFlagThresholdHours }) =>
      `Travel ${formatHours(stint.travelHours ?? 0)} is over the ${formatHours(travelFlagThresholdHours)} threshold`,
    facts: (row) => [row.travelHours],
  },
  'travel-clamped': {
    label: `Travel set to ${formatHours(0)}`,
    holds: (stint) => stint.travelClamped,
    sentence: (stint) =>
      `Travel set to ${formatHours(0)}: arrival ${formatHours(stint.arrival?.hours ?? 0)} is below the Machine's previous departure`,
    facts: (row) => [row.travelClamped, row.arrivalHours],
  },
  'john-deere-difference': {
    label: `${JD_LINK_LABEL} differs`,
    holds: (stint, { johnDeereDifferenceThresholdHours }) =>
      johnDeereDifferenceOver(stint, johnDeereDifferenceThresholdHours) !== null,
    sentence: (stint, { johnDeereDifferenceThresholdHours }) =>
      `${JD_LINK_LABEL} differs by ${formatHours(johnDeereDifferenceOver(stint, johnDeereDifferenceThresholdHours) ?? 0)}`,
    facts: (row) => [row.arrivalHours, row.departureHours, row.arrivalTelematicsHours, row.departureTelematicsHours],
  },
};

export const assignmentAttentionKindLabel = (kind: AssignmentAttentionKind) => attentionKindRules[kind].label;

export const stintAttentionKinds = (stint: AttentionStint, thresholds: AttentionThresholds) =>
  assignmentAttentionKinds.filter((kind) => attentionKindRules[kind].holds(stint, thresholds));

/**
 * The kinds that hold, split by whether someone dismissed them. A dismissal of a kind that no longer holds is
 * dropped: it re-arms with its facts, so it never outlives them.
 */
export function stintAttention(
  stint: AttentionStint,
  thresholds: AttentionThresholds,
  dismissals: readonly DismissedAttention[],
): { attention: AssignmentAttentionKind[]; dismissedAttention: DismissedAttention[] } {
  const holding = stintAttentionKinds(stint, thresholds);
  const dismissed = new Map(dismissals.map((dismissal) => [dismissal.kind, dismissal]));
  return {
    attention: holding.filter((kind) => !dismissed.has(kind)),
    dismissedAttention: holding.flatMap((kind) => dismissed.get(kind) ?? []),
  };
}

/** The kinds whose facts a write changed: their dismissals no longer stand. */
export const rearmedAttentionKinds = (before: AttentionFactsRow, after: AttentionFactsRow) =>
  assignmentAttentionKinds.filter((kind) => {
    const was = attentionKindRules[kind].facts(before);
    const is = attentionKindRules[kind].facts(after);
    return was.some((value, index) => value !== is[index]);
  });

/** Every kind on the stint that holds, dismissed or not, in the kinds' fixed order: dismissing never moves a badge. */
export type AttentionBadge = { kind: AssignmentAttentionKind; dismissal: DismissedAttention | null };

export const attentionBadges = (stint: {
  attention: readonly AssignmentAttentionKind[];
  dismissedAttention: readonly DismissedAttention[];
}): AttentionBadge[] =>
  assignmentAttentionKinds.flatMap((kind): AttentionBadge[] => {
    if (stint.attention.includes(kind)) return [{ kind, dismissal: null }];
    const dismissal = stint.dismissedAttention.find((each) => each.kind === kind);
    return dismissal ? [{ kind, dismissal }] : [];
  });

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
