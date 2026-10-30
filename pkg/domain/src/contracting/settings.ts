import type { ContractingSettingsUpdateInput } from '@pkg/schema/contracting';

/** What the Settings row holds until management changes it; the migration seeds the same values. */
export const CONTRACTING_SETTINGS_DEFAULTS = {
  travelFlagThresholdHours: 4,
  johnDeereDifferenceThresholdHours: 10,
  serviceDueSoonThresholdHours: 100,
  utilisationTargetPercent: null,
} as const satisfies ContractingSettingsUpdateInput;
