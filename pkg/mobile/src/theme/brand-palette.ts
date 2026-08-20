type PrimaryColorTriplets = {
  light: string;
  dark: string;
};

export function resolvePrimaryColorTriplets(isStaging: boolean): PrimaryColorTriplets {
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

/** Tile behind the app-icon scarab; mirrors the icon assets' own background fill. */
export function resolveAppIconTileColor(isStaging: boolean): string {
  return isStaging ? '#ec4899' : '#fff000';
}
