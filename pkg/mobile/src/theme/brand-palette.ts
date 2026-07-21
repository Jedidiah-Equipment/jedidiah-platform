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

export function resolveLoadingSpinnerColor(isStaging: boolean): string {
  return isStaging ? '#ff6bbf' : '#fff000';
}

/** Tile behind the app-icon scarab; mirrors the icon assets' own background fill. */
export function resolveAppIconTileColor(isStaging: boolean): string {
  return isStaging ? '#ec4899' : '#fff000';
}
