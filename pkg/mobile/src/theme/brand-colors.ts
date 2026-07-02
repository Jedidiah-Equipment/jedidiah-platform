import { isStagingAppEnv } from '../lib/app-env';

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

export const primaryColorTriplets = resolvePrimaryColorTriplets(isStagingAppEnv);
export const loadingSpinnerColor = resolveLoadingSpinnerColor(isStagingAppEnv);
