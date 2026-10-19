import { UUID } from '@pkg/schema';
import { type BreakdownUrgency, type JobCreateInput, JobDescription } from '@pkg/schema/contracting';
import { z } from 'zod';
import { requiredSelection } from '@/components/form/utils/form-schema.js';

export const JobCreateValues = z.object({
  customerId: requiredSelection(UUID, 'Choose a Customer'),
  farmId: requiredSelection(UUID, 'Choose a Farm'),
  workTypeId: requiredSelection(UUID, 'Choose a Work Type'),
  description: z.string(),
  foremanUserId: z.string(),
});
export type JobCreateValues = z.infer<typeof JobCreateValues>;

export function toJobCreateInput(values: JobCreateValues): JobCreateInput {
  return {
    customerId: values.customerId,
    farmId: values.farmId,
    workTypeId: values.workTypeId,
    description: JobDescription.parse(values.description.trim() || null),
    foremanUserId: values.foremanUserId || null,
  };
}

/** The one dialog the Machines card has open, naming its Machine Assignment by id so it follows refetches. */
export type MachineDialog =
  | { kind: 'plan' }
  | { kind: 'arrival' | 'departure' | 'gap'; stintId: string }
  | { kind: 'reading'; stintId: string; role: 'arrival' | 'departure' }
  | { kind: 'breakdown'; stintId: string; urgency: BreakdownUrgency };
