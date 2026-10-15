import { darkColors, hexToRgbTriplet, lightColors } from '@pkg/domain';

/** A colour pair keyed by the scheme that paints it. */
type ColorsByScheme = {
  light: string;
  dark: string;
};

export function resolvePrimaryColorTriplets(isStaging: boolean): ColorsByScheme {
  return isStaging
    ? {
        light: '236 72 153',
        dark: '255 107 191',
      }
    : {
        light: hexToRgbTriplet(lightColors.primary),
        dark: hexToRgbTriplet(darkColors.primary),
      };
}

/**
 * The accent for primary-tinted card actions in light mode. Production paints the shared light primary,
 * the shade web also uses for text; staging pink is hand-darkened here. Dark mode paints the `primary`
 * token directly.
 */
export function resolveAccentActionColor(isStaging: boolean): string {
  return isStaging ? '#9d174d' : lightColors.primary;
}

export function resolveLoadingSpinnerColor(isStaging: boolean): string {
  return isStaging ? '#ff6bbf' : '#fff000';
}

/**
 * The brand accent wherever it paints a foreground on a themed surface — spinners, the selected tab,
 * accent icons and text. Dark mode carries the brand primary itself; light mode takes the same
 * accent {@link resolveAccentActionColor} gives card actions.
 */
export function resolveBrandForegroundColors(isStaging: boolean): ColorsByScheme {
  return {
    dark: resolveLoadingSpinnerColor(isStaging),
    light: resolveAccentActionColor(isStaging),
  };
}

/** Tile behind the app-icon scarab; mirrors the icon assets' own background fill. */
export function resolveAppIconTileColor(isStaging: boolean): string {
  return isStaging ? '#ec4899' : '#fff000';
}
