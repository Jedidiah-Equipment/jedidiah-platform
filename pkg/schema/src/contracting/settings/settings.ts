import { z } from 'zod';
import { DateIso } from '../../common/date.js';

/** Hours, to one decimal, that an Hour Gap may run before it raises a Gap Flag. */
export const GapFlagThresholdHours = z.number().min(0.5).max(48).multipleOf(0.1);
/** Whole hours before Next Service Due at which a Machine is Service Due Soon. */
export const ServiceDueSoonThresholdHours = z.int().min(0).max(1000);
/** Whole percent drawn as the Utilisation Target line. */
export const UtilisationTargetPercent = z.int().min(1).max(100);

export const ContractingSettings = z.object({
  gapFlagThresholdHours: GapFlagThresholdHours,
  serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
  utilisationTargetPercent: UtilisationTargetPercent.nullable(),
  updatedAt: DateIso,
});
export type ContractingSettings = z.infer<typeof ContractingSettings>;

/** A full replacement: the page always sends all three. */
export const ContractingSettingsUpdateInput = z
  .object({
    gapFlagThresholdHours: GapFlagThresholdHours,
    serviceDueSoonThresholdHours: ServiceDueSoonThresholdHours,
    utilisationTargetPercent: UtilisationTargetPercent.nullable(),
  })
  .strict();
export type ContractingSettingsUpdateInput = z.infer<typeof ContractingSettingsUpdateInput>;
