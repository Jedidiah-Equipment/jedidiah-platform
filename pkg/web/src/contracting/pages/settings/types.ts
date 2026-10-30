import {
  type ContractingSettings,
  type ContractingSettingsUpdateInput,
  JohnDeereDifferenceThresholdHours,
  ServiceDueSoonThresholdHours,
  TravelFlagThresholdHours,
  UtilisationTargetPercent,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { nanToNull, optionalNumber } from '@/components/form/utils/form-schema.js';

export const SettingsFormValues = z.object({
  travelFlagThresholdHours: TravelFlagThresholdHours,
  johnDeereDifferenceThresholdHours: JohnDeereDifferenceThresholdHours,
  serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
  utilisationTargetPercent: optionalNumber(UtilisationTargetPercent),
});
export type SettingsFormValues = z.infer<typeof SettingsFormValues>;

/** The form's blank target is NaN where the row's is null. */
export function settingsFormValues(settings: ContractingSettings): SettingsFormValues {
  return {
    travelFlagThresholdHours: settings.travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours: settings.johnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours: settings.serviceDueSoonThresholdHours,
    utilisationTargetPercent: settings.utilisationTargetPercent ?? NaN,
  };
}

/** Maps validated form values back to the API shape; the submit validator has already run. */
export function settingsFormToInput(values: SettingsFormValues): ContractingSettingsUpdateInput {
  return {
    travelFlagThresholdHours: values.travelFlagThresholdHours,
    johnDeereDifferenceThresholdHours: values.johnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours: values.serviceDueSoonThresholdHours,
    utilisationTargetPercent: nanToNull(values.utilisationTargetPercent),
  };
}
