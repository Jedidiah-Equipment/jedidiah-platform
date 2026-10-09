import type { ColorScheme } from '@pkg/domain';
import { breakdownUrgencyColorClassNames, categoryColourTone } from '@pkg/domain/contracting';
import type { BreakdownUrgency, CategoryColour, CategoryIconKey } from '@pkg/schema/contracting';
import type { ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { BreakdownIcon } from './BreakdownSubjectIcons';
import { CategoryGlyph } from './CategoryIcon';

/**
 * Tile tint and glyph for a Contracting list card's avatar, as `offeringAvatarProps` gives Equipment's: the card owns
 * the tile's size and rounded-square shape, these only colour and fill it.
 */
type TileProps = { className: string; fallback: ReactNode };
const GLYPH_SIZE = 22;

export function categoryTileProps(icon: CategoryIconKey, colour: CategoryColour, scheme: ColorScheme): TileProps {
  const tone = categoryColourTone(colour);
  return {
    className: tone.chip,
    fallback: <CategoryGlyph className={tone.textByScheme[scheme]} icon={icon} size={GLYPH_SIZE} />,
  };
}

export function urgencyTileProps(urgency: BreakdownUrgency): TileProps {
  const tone = breakdownUrgencyColorClassNames[urgency];
  return { className: tone.chip, fallback: <Icon className={tone.icon} icon={BreakdownIcon} size={GLYPH_SIZE} /> };
}
