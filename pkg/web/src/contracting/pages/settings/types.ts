import {
  type ContractingSettings,
  type ContractingSettingsUpdateInput,
  GapFlagThresholdHours,
  ServiceDueSoonThresholdHours,
  UtilisationTargetPercent,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { nanToNull, optionalNumber } from '@/components/form/utils/form-schema.js';

export const SettingsFormValues = z.object({
  gapFlagThresholdHours: GapFlagThresholdHours,
  serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
  utilisationTargetPercent: optionalNumber(UtilisationTargetPercent),
});
export type SettingsFormValues = z.infer<typeof SettingsFormValues>;

/** The form's blank target is NaN where the row's is null. */
export function settingsFormValues(settings: ContractingSettings): SettingsFormValues {
  return {
    gapFlagThresholdHours: settings.gapFlagThresholdHours,
    serviceDueSoonThresholdHours: settings.serviceDueSoonThresholdHours,
    utilisationTargetPercent: settings.utilisationTargetPercent ?? NaN,
  };
}

/** Maps validated form values back to the API shape; the submit validator has already run. */
export function settingsFormToInput(values: SettingsFormValues): ContractingSettingsUpdateInput {
  return {
    gapFlagThresholdHours: values.gapFlagThresholdHours,
    serviceDueSoonThresholdHours: values.serviceDueSoonThresholdHours,
    utilisationTargetPercent: nanToNull(values.utilisationTargetPercent),
  };
}
