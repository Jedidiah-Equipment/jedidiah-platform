import type {
  AiFlaggedVerification,
  AssignmentAttentionLevel,
  JobReadingAttentionKind,
  NeedsALookLevel,
  ReadingExceptionType,
} from '@pkg/schema/contracting';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../theme/status-badge.js';

/*
 * Assignment attention levels, quietest first:
 * - notice: worth knowing, nothing to do.
 * - warning: the evidence does not confirm the value; someone should review it.
 * - critical: the hours are wrong or contradictory, or it stops the Job moving on.
 * Warning and critical need a look: they are counted, filtered for, and border the card. Notices never do.
 */
export const needsALook = (level: AssignmentAttentionLevel): level is NeedsALookLevel => level !== 'notice';

/** Everything that can flag a Machine Assignment: its Gap Flag and each reading's attention kinds. */
export type AssignmentAttentionKind = 'gap-flag' | JobReadingAttentionKind;

export const assignmentAttentionKindLevels = {
  'gap-flag': 'critical',
  disputed: 'critical',
  'ai-disagrees': 'warning',
  'ai-low-confidence': 'warning',
  'ai-pending': 'notice',
  'missing-photo': 'notice',
} as const satisfies Record<AssignmentAttentionKind, AssignmentAttentionLevel>;

export const assignmentAttentionKindLabels: Record<AssignmentAttentionKind, string> = {
  'gap-flag': 'Gap flag',
  disputed: 'Disputed',
  'ai-disagrees': 'AI value differs',
  'ai-low-confidence': 'AI confidence low',
  'ai-pending': 'AI verification pending',
  'missing-photo': 'Missing photo',
};

/** The level of an AI verdict an unreviewed reading carries. */
export const aiVerificationLevel = (verification: AiFlaggedVerification): AssignmentAttentionLevel =>
  assignmentAttentionKindLevels[`ai-${verification}`];

/** Each Reading Exceptions type at its kind's level; every AI verdict that needs a look is a warning. */
export const readingExceptionTypeLevels = {
  disputed: assignmentAttentionKindLevels.disputed,
  'ai-flagged': 'warning',
} as const satisfies Record<ReadingExceptionType, NeedsALookLevel>;

export type AssignmentAttentionCounts = Record<NeedsALookLevel, number>;

/** The loudest of these levels when it needs a look, or null when none does. */
export function loudestNeedingALook(levels: Iterable<AssignmentAttentionLevel>): NeedsALookLevel | null {
  const present = new Set(levels);
  return present.has('critical') ? 'critical' : present.has('warning') ? 'warning' : null;
}

/** The level a count of items needing a look shows at, or null when nothing needs a look. */
export const countedAssignmentAttentionLevel = (counts: AssignmentAttentionCounts): NeedsALookLevel | null =>
  counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warning' : null;

export const tallyAssignmentAttention = (levels: Iterable<NeedsALookLevel>): AssignmentAttentionCounts => {
  const counts = { critical: 0, warning: 0 };
  for (const level of levels) counts[level] += 1;
  return counts;
};

/** A Job's items needing a look: each open Gap Flag, and each flagged reading once at its loudest level. */
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
  notice: {
    ...statusBadgeColorClassNames.purple,
    icon: 'text-purple-500',
    border: 'border-purple-500/60',
    button:
      'border-purple-500/50 bg-purple-500/15 text-purple-700 hover:bg-purple-500/25 dark:border-purple-500/50 dark:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/25',
  },
  warning: {
    ...statusBadgeColorClassNames.orange,
    icon: 'text-orange-500',
    border: 'border-orange-500/60',
    button:
      'border-orange-500/50 bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 dark:border-orange-500/50 dark:bg-orange-500/15 dark:text-orange-300 dark:hover:bg-orange-500/25',
  },
  critical: {
    ...statusBadgeColorClassNames.red,
    icon: 'text-red-500',
    border: 'border-red-500/60',
    button:
      'border-red-500/50 bg-red-500/15 text-red-700 hover:bg-red-500/25 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-300 dark:hover:bg-red-500/25',
  },
};
