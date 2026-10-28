import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import type { BreakdownStatus, BreakdownSubject, BreakdownUrgency } from '@pkg/schema/contracting';
import { IconFlagFilled } from '@tabler/icons-react-native';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Icon } from '@/components/ui/icon';
import { StatusBadge } from '@/components/ui/status-badge';
import { CategoryIcon, categoryGlyphSize, categoryTileSize } from './CategoryIcon';

type IconSize = 16 | 20 | 24;

/** The Breakdown glyph: urgency, and every action that reports a problem. */
export const BreakdownIcon = IconFlagFilled;

/** A card's border for the most urgent open Breakdown on it; none when there is none, so the card keeps its own. */
export const breakdownBorder = (breakdown: { urgency: BreakdownUrgency } | null | undefined) =>
  breakdown ? breakdownUrgencyColorClassNames[breakdown.urgency].border : undefined;

/** A Breakdown's urgency: a red or green flag on a tinted tile, `tile` points square (default: a `CategoryIcon`'s). */
export function BreakdownUrgencyIcon({
  urgency,
  tile = categoryTileSize(20),
}: {
  urgency: BreakdownUrgency;
  tile?: number;
}) {
  const tone = breakdownUrgencyColorClassNames[urgency];
  return (
    <View
      accessibilityLabel={breakdownUrgencyLabels[urgency]}
      accessibilityRole="image"
      accessible
      className={`shrink-0 items-center justify-center rounded-lg border ${tone.chip}`}
      style={{ width: tile, height: tile }}
    >
      <Icon className={tone.icon} icon={BreakdownIcon} size={Math.round(categoryGlyphSize(tile) * 0.8)} />
    </View>
  );
}

/** A card's flag for its most urgent open Breakdown: tap it to open that Breakdown in the Workshop. */
export function BreakdownFlagButton({
  breakdown,
  code,
  tile,
}: {
  breakdown: { id: string; urgency: BreakdownUrgency };
  /** The Machine the flag is on, for the accessibility label. */
  code: string;
  tile: number;
}) {
  return (
    <Pressable
      accessibilityLabel={`${breakdownUrgencyLabels[breakdown.urgency]} on ${code}: open it`}
      accessibilityRole="button"
      hitSlop={8}
      onPress={() =>
        router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: breakdown.id } })
      }
    >
      <BreakdownUrgencyIcon tile={tile} urgency={breakdown.urgency} />
    </Pressable>
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
      <BreakdownUrgencyIcon urgency={urgency} tile={categoryTileSize(size)} />
      <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={size} />
    </View>
  );
}

export function BreakdownStatusBadge({ status }: { status: BreakdownStatus }) {
  return <StatusBadge classNames={breakdownStatusColorClassNames[status]} label={breakdownStatusLabels[status]} />;
}
