import { z } from 'zod';
import { DateIso } from '../../common/date.js';

/** Hours, to one decimal, of Travel above which a Machine Assignment needs a look. */
export const TravelFlagThresholdHours = z.number().min(0.5).max(48).multipleOf(0.1);
/** Hours, to one decimal, that Job Hours may sit from John Deere's last reading before the stint needs a look. */
export const JohnDeereDifferenceThresholdHours = z.number().min(1).max(200).multipleOf(0.1);
/** Whole hours before Next Service Due at which a Machine is Service Due Soon. */
export const ServiceDueSoonThresholdHours = z.int().min(0).max(1000);
/** Whole percent drawn as the Utilisation Target line. */
export const UtilisationTargetPercent = z.int().min(1).max(100);

export const ContractingSettings = z.object({
  travelFlagThresholdHours: TravelFlagThresholdHours,
  johnDeereDifferenceThresholdHours: JohnDeereDifferenceThresholdHours,
  serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
  utilisationTargetPercent: UtilisationTargetPercent.nullable(),
  updatedAt: DateIso,
});
export type ContractingSettings = z.infer<typeof ContractingSettings>;

/** A full replacement: the page always sends every field. */
export const ContractingSettingsUpdateInput = z
  .object({
    travelFlagThresholdHours: TravelFlagThresholdHours,
    johnDeereDifferenceThresholdHours: JohnDeereDifferenceThresholdHours,
    serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
    utilisationTargetPercent: UtilisationTargetPercent.nullable(),
  })
  .strict();
export type ContractingSettingsUpdateInput = z.infer<typeof ContractingSettingsUpdateInput>;
