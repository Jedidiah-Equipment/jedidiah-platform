import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import type { BreakdownStatus, BreakdownSubject, BreakdownUrgency } from '@pkg/schema/contracting';
import { IconFlagFilled } from '@tabler/icons-react-native';
import { View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { CategoryIcon } from './CategoryIcon';

type IconSize = 16 | 20 | 24;

/** The Breakdown glyph: urgency, and every action that reports a problem. */
export const BreakdownIcon = IconFlagFilled;

/** A Breakdown's urgency: a red or green flag on a tinted tile the size of a `CategoryIcon`, as web draws it. */
export function BreakdownUrgencyIcon({ urgency, size = 20 }: { urgency: BreakdownUrgency; size?: IconSize }) {
  const tone = breakdownUrgencyColorClassNames[urgency];
  return (
    <View
      accessibilityLabel={breakdownUrgencyLabels[urgency]}
      accessibilityRole="image"
      accessible
      className={`shrink-0 items-center justify-center rounded-lg border ${tone.chip}`}
      style={{ width: size + 10, height: size + 10 }}
    >
      <Icon className={tone.icon} icon={BreakdownIcon} size={Math.round(size * 0.8)} />
    </View>
  );
}

/**
 * How every Breakdown leads its row: the urgency flag, then the subject's category icon at the same size. The
 * subject's name follows, and a status badge, when shown, sits at the far right of the row.
 */
export function BreakdownSubjectIcons({
  urgency,
  subject,
  size = 20,
}: {
  urgency: BreakdownUrgency;
  subject: Pick<BreakdownSubject, 'categoryIcon' | 'categoryColour'>;
  size?: IconSize;
}) {
  return (
    <View className="shrink-0 flex-row items-center gap-1.5">
      <BreakdownUrgencyIcon urgency={urgency} size={size} />
      <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={size} />
    </View>
  );
}

export function BreakdownStatusBadge({ status }: { status: BreakdownStatus }) {
  return <StatusBadge classNames={breakdownStatusColorClassNames[status]} label={breakdownStatusLabels[status]} />;
}
