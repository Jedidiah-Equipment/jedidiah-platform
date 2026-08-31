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
        light: '248 211 0',
        dark: '255 240 0',
      };
}

/**
 * The accent for primary-tinted card actions in light mode. Neither brand primary — production
 * yellow, staging pink — clears contrast as text on a light surface, so each is hand-darkened here;
 * dark mode paints the `primary` token directly.
 */
export function resolveAccentActionColor(isStaging: boolean): string {
  return isStaging ? '#9d174d' : '#806700';
}

export function resolveLoadingSpinnerColor(isStaging: boolean): string {
  return isStaging ? '#ff6bbf' : '#fff000';
}

/**
 * The brand accent wherever it paints a foreground on a themed surface — spinners, the selected tab,
 * accent icons and text. Dark mode carries the brand primary itself; light mode takes the same
 * hand-darkened accent {@link resolveAccentActionColor} gives card actions, because neither brand
 * primary is legible against a light surface.
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
