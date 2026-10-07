import { cssInterop } from 'nativewind';
import Svg from 'react-native-svg';

/**
 * The same seam as `icon.tsx` for a hand-drawn svg: the class's resolved colour lands on the svg `color` prop, which
 * `currentColor` strokes and fills read.
 */
export const StyledSvg = cssInterop(Svg, { className: { target: 'style', nativeStyleToProp: { color: true } } });
