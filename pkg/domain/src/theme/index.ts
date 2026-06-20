import { darkColors, lightColors, type ThemeColors } from './colors.js';
import {
  type FontSizes,
  type FontWeights,
  fontSizes,
  fontWeights,
  type Radii,
  radii,
  type Spacing,
  spacing,
} from './scale.js';
import { darkStatusColors, lightStatusColors, type StatusColors } from './status.js';

export * from './colors.js';
export * from './scale.js';
export * from './status.js';

export type ColorScheme = 'light' | 'dark';

/** A complete, scheme-specific token set for a single app theme. */
export type Theme = {
  scheme: ColorScheme;
  colors: ThemeColors;
  status: StatusColors;
  spacing: Spacing;
  radii: Radii;
  fontSizes: FontSizes;
  fontWeights: FontWeights;
};

export const lightTheme: Theme = {
  scheme: 'light',
  colors: lightColors,
  status: lightStatusColors,
  spacing,
  radii,
  fontSizes,
  fontWeights,
};

export const darkTheme: Theme = {
  scheme: 'dark',
  colors: darkColors,
  status: darkStatusColors,
  spacing,
  radii,
  fontSizes,
  fontWeights,
};

export const themes: Record<ColorScheme, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};
