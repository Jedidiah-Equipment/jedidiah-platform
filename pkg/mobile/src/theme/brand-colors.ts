import Constants from 'expo-constants';

import { isStagingRuntimeApp } from '../lib/runtime-app-identity';
import { resolveLoadingSpinnerColor, resolvePrimaryColorTriplets } from './brand-palette';

// Brand identity follows the installed app variant, not whichever API environment it targets.
const isStagingBrand = isStagingRuntimeApp(Constants.expoConfig);

export const primaryColorTriplets = resolvePrimaryColorTriplets(isStagingBrand);
export const loadingSpinnerColor = resolveLoadingSpinnerColor(isStagingBrand);
