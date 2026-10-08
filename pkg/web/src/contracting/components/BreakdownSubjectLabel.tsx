import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import type { BreakdownStatus, BreakdownSubject, BreakdownUrgency } from '@pkg/schema/contracting';
import { IconFlagFilled } from '@tabler/icons-react';
import type React from 'react';
import { Badge } from '@/components/ui/badge.js';
import { cn } from '@/lib/utils.js';
import { CategoryIcon } from './CategoryIcon.js';

type IconSize = 14 | 16 | 20 | 24;

/** A Breakdown's urgency: a red or green flag on a tinted disc the size of a `CategoryIcon`. */
export function BreakdownUrgencyIcon({ urgency, size = 20 }: { urgency: BreakdownUrgency; size?: IconSize }) {
  const tone = breakdownUrgencyColorClassNames[urgency];
  const label = breakdownUrgencyLabels[urgency];
  const glyph = Math.round(size * 0.8);
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full border', tone.chip, tone.icon)}
      style={{ width: size + 10, height: size + 10 }}
    >
      <IconFlagFilled aria-hidden="true" style={{ width: glyph, height: glyph }} />
    </span>
  );
}

/**
 * How every Breakdown names its subject: the urgency flag, then the subject's category icon at the same size, then
 * the name. A status badge, when shown, sits at the far right of the row.
 */
export function BreakdownSubjectLabel({
  urgency,
  subject,
  name,
  size = 20,
  className,
}: {
  urgency: BreakdownUrgency;
  subject: Pick<BreakdownSubject, 'categoryIcon' | 'categoryColour'>;
  name: React.ReactNode;
  size?: IconSize;
  className?: string;
}) {
  return (
    <span className={cn('flex min-w-0 items-center', size === 24 ? 'gap-3' : 'gap-2', className)}>
      <span className="flex shrink-0 items-center gap-1.5">
        <BreakdownUrgencyIcon urgency={urgency} size={size} />
        <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={size} />
      </span>
      {name}
    </span>
  );
}

/** A Breakdown's status as a badge; rows and headers keep it at the far right. */
export function BreakdownStatusBadge({ status }: { status: BreakdownStatus }) {
  const tone = breakdownStatusColorClassNames[status];
  return (
    <Badge className={cn('shrink-0', tone.chip, tone.text)} variant="outline">
      {breakdownStatusLabels[status]}
    </Badge>
  );
}
