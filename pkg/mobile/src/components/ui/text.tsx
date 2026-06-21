import { Platform, Text as RNText, type TextProps } from 'react-native';

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

// Codes (job/quote/model/serial) render monospace to match web's `font-mono`.
// Web uses the OS monospace stack; RN can't resolve a stack or the bare
// `monospace` alias on iOS, so the system face is selected per platform.
const MONO_FONT_FAMILY = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

export type AppTextProps = TextProps & {
  className?: string;
  weight?: TextWeight;
  /** Render in the system monospace face (for codes), matching web's `font-mono`. */
  mono?: boolean;
};

export function Text({ className, weight = 'regular', mono = false, style, ...props }: AppTextProps) {
  return (
    <RNText
      className={`${weightClassName[weight]} ${className ?? ''}`}
      style={mono ? [{ fontFamily: MONO_FONT_FAMILY }, style] : style}
      {...props}
    />
  );
}
