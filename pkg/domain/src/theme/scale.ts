/**
 * Layout + type scale tokens, in device-independent pixels.
 *
 * A compact, named scale distilled from the Bay Operator prototype rather than
 * a copy of every literal value, so screens share a consistent rhythm.
 */

/** Spacing scale (padding, gaps, margins). */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

/** Corner radii. `full` pills circular/rounded elements. */
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
} as const;

/** Font size scale. */
export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  '2xl': 27,
  '3xl': 34,
} as const;

/** Font weight scale. */
export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export type Spacing = typeof spacing;
export type Radii = typeof radii;
export type FontSizes = typeof fontSizes;
export type FontWeights = typeof fontWeights;
