import Constants from 'expo-constants';

import { isStagingRuntimeApp } from '../lib/runtime-app-identity';
import {
  resolveAccentActionColor,
  resolveBrandForegroundColors,
  resolveLoadingSpinnerColor,
  resolvePrimaryColorTriplets,
} from './brand-palette';

// Brand identity follows the installed app variant, not whichever API environment it targets.
const isStagingBrand = isStagingRuntimeApp(Constants.expoConfig);

export const primaryColorTriplets = resolvePrimaryColorTriplets(isStagingBrand);
export const loadingSpinnerColor = resolveLoadingSpinnerColor(isStagingBrand);
export const accentActionColor = resolveAccentActionColor(isStagingBrand);
export const brandForegroundColors = resolveBrandForegroundColors(isStagingBrand);
