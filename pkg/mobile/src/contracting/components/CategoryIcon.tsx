import {
  CATEGORY_ICON_STROKE_WIDTH,
  CATEGORY_ICON_VIEW_BOX,
  categoryColourTone,
  categoryIcon,
} from '@pkg/domain/contracting';
import type { CategoryColour, CategoryIconKey } from '@pkg/schema/contracting';
import { View } from 'react-native';
import { Path } from 'react-native-svg';
import { StyledSvg } from '@/components/ui/svg';
import { useColorMode } from '@/theme/use-color-mode';

/** A category's bare glyph, for a tile something else frames, such as a list card's avatar. */
export function CategoryGlyph({ icon, size, className }: { icon: CategoryIconKey; size: number; className: string }) {
  const glyph = categoryIcon(icon);
  return (
    <StyledSvg
      accessibilityLabel={glyph.label}
      className={className}
      width={size}
      height={size}
      viewBox={CATEGORY_ICON_VIEW_BOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={CATEGORY_ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {glyph.paths.map((d) => (
        <Path key={d} d={d} />
      ))}
    </StyledSvg>
  );
}

/** A category's glyph on its tinted tile, the thumbnail the field screens show; records are squares, people circles. */
export function CategoryIcon({
  icon,
  colour,
  size = 20,
}: {
  icon: CategoryIconKey;
  colour: CategoryColour;
  size?: 16 | 20 | 24;
}) {
  const tone = categoryColourTone(colour);
  const { resolved } = useColorMode();
  return (
    <View
      className={`items-center justify-center rounded-lg border ${tone.chip}`}
      style={{ width: size + 10, height: size + 10 }}
      accessibilityRole="image"
      accessibilityLabel={categoryIcon(icon).label}
    >
      <CategoryGlyph className={tone.textByScheme[resolved]} icon={icon} size={size} />
    </View>
  );
}
