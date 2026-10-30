import type { AssignmentAttentionLevel, JobReadingAttentionKind, NeedsALookLevel } from '@pkg/schema/contracting';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';

/*
 * Assignment Attention has one level, critical: the hours are wrong or contradictory, or it stops the Job moving on.
 * Critical needs a look: it is counted, filtered for, and borders the card.
 */

/** Everything that can flag a Machine Assignment: its Gap Flag and each reading's attention kinds. */
export type AssignmentAttentionKind = 'gap-flag' | JobReadingAttentionKind;

export const assignmentAttentionKindLevels = {
  'gap-flag': 'critical',
  disputed: 'critical',
} as const satisfies Record<AssignmentAttentionKind, AssignmentAttentionLevel>;

export const assignmentAttentionKindLabels: Record<AssignmentAttentionKind, string> = {
  'gap-flag': 'Gap flag',
  disputed: 'Disputed',
};

export type AssignmentAttentionCounts = Record<NeedsALookLevel, number>;

/** The loudest of these levels, or null when there are none. */
export function loudestNeedingALook(levels: Iterable<AssignmentAttentionLevel>): NeedsALookLevel | null {
  return new Set(levels).has('critical') ? 'critical' : null;
}

/** The level a count of items needing a look shows at, or null when nothing needs a look. */
export const countedAssignmentAttentionLevel = (counts: AssignmentAttentionCounts): NeedsALookLevel | null =>
  counts.critical > 0 ? 'critical' : null;

export const tallyAssignmentAttention = (levels: Iterable<NeedsALookLevel>): AssignmentAttentionCounts => {
  const counts = { critical: 0 };
  for (const level of levels) counts[level] += 1;
  return counts;
};

/** A Job's items needing a look: each open Gap Flag, and each flagged reading once. */
export function jobAssignmentAttentionCounts(
  openGapFlags: number,
  readings: AssignmentAttentionCounts,
): AssignmentAttentionCounts {
  const gapLevel = assignmentAttentionKindLevels['gap-flag'];
  return { ...readings, [gapLevel]: readings[gapLevel] + openGapFlags };
}

type AttentionReading = { attention: readonly JobReadingAttentionKind[] };

export type AssignmentAttentionItem = { kind: AssignmentAttentionKind; level: AssignmentAttentionLevel };

/** Every attention item on a Machine Assignment with its level: its Gap Flag, then each reading's kinds. */
export function assignmentAttentionItems(assignment: {
  gapFlag: boolean;
  arrival: AttentionReading | null;
  departure: AttentionReading | null;
}): AssignmentAttentionItem[] {
  const kinds: AssignmentAttentionKind[] = [
    ...(assignment.gapFlag ? (['gap-flag'] as const) : []),
    ...(assignment.arrival?.attention ?? []),
    ...(assignment.departure?.attention ?? []),
  ];
  return kinds.map((kind) => ({ kind, level: assignmentAttentionKindLevels[kind] }));
}

/** The loudest level on a Machine Assignment that needs a look, or null when nothing does. */
export const assignmentNeedsALookLevel = (assignment: Parameters<typeof assignmentAttentionItems>[0]) =>
  loudestNeedingALook(assignmentAttentionItems(assignment).map((item) => item.level));

/** Every class an attention surface paints with: chip, text, dot, a bare icon, a card border, and an icon button. */
export type AssignmentAttentionColorClassNames = BadgeColorClassNames & {
  dot: string;
  icon: string;
  border: string;
  button: string;
};

/** The one colour set for each level, shared by every contracting surface. */
export const assignmentAttentionLevelColorClassNames: Record<
  AssignmentAttentionLevel,
  AssignmentAttentionColorClassNames
> = {
  critical: {
    ...statusBadgeColorClassNames.red,
    icon: 'text-red-500',
    border: 'border-red-500/60',
    button:
      'border-red-500/50 bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25',
  },
};
