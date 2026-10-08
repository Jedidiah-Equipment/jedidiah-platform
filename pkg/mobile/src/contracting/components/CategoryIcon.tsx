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

/** A category's glyph on its tinted disc, the thumbnail the field screens show. */
export function CategoryIcon({
  icon,
  colour,
  size = 20,
}: {
  icon: CategoryIconKey;
  colour: CategoryColour;
  size?: 16 | 20 | 24;
}) {
  const glyph = categoryIcon(icon);
  const tone = categoryColourTone(colour);
  const { resolved } = useColorMode();
  return (
    <View
      className={`items-center justify-center rounded-full border ${tone.chip}`}
      style={{ width: size + 10, height: size + 10 }}
      accessibilityRole="image"
      accessibilityLabel={glyph.label}
    >
      <StyledSvg
        className={tone.textByScheme[resolved]}
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
    </View>
  );
}
