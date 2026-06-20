import { Text as RNText, type TextProps } from 'react-native';

/**
 * App text primitive. Defaults to Geist (the shared app font) so callers never
 * repeat a font class; pass `weight` for heavier faces.
 *
 * RN has no font inheritance and can't synthesise weights, so each weight is a
 * distinct loaded family (see app/_layout.tsx + tailwind.config.js). This maps
 * the documented NativeWind per-weight pattern in one place.
 */
const weightClassName = {
  regular: 'font-sans',
  semibold: 'font-geist-semibold',
  bold: 'font-geist-bold',
} as const;

export type TextWeight = keyof typeof weightClassName;

export type AppTextProps = TextProps & {
  className?: string;
  weight?: TextWeight;
};

export function Text({ className, weight = 'regular', ...props }: AppTextProps) {
  return <RNText className={`${weightClassName[weight]} ${className ?? ''}`} {...props} />;
}
