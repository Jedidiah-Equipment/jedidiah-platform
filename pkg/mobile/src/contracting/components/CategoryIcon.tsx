import {
  CATEGORY_ICON_STROKE_WIDTH,
  CATEGORY_ICON_VIEW_BOX,
  categoryColourClassNames,
  categoryIcon,
} from '@pkg/domain/contracting';
import type { CategoryColour, CategoryIconKey } from '@pkg/schema/contracting';
import { cssInterop } from 'nativewind';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useColorMode } from '@/theme/use-color-mode';

// The same seam as `ui/icon.tsx`: the class's resolved colour lands on the svg `color` prop, which
// `currentColor` strokes read.
const StyledSvg = cssInterop(Svg, { className: { target: 'style', nativeStyleToProp: { color: true } } });

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
  const tone = categoryColourClassNames[colour];
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
