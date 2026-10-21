import { z } from 'zod';
import { requiredSelection } from '../../common/form.js';
import { UUID } from '../../common/uuid.js';
import { JobCreateInput } from './job.js';

/** The New job form as both the web and the phone hold it: an unchosen picker or Foreman is an empty string. */
export const JobCreateValues = z.object({
  customerId: requiredSelection(UUID, 'Choose a Customer'),
  farmId: requiredSelection(UUID, 'Choose a Farm'),
  workTypeId: requiredSelection(UUID, 'Choose a Work Type'),
  description: z.string(),
  foremanUserId: z.string(),
});
export type JobCreateValues = z.infer<typeof JobCreateValues>;

/** The create input for valid form values; the input's own scalars trim the description and blank it to none. */
export function toJobCreateInput(values: JobCreateValues): JobCreateInput {
  return JobCreateInput.parse({ ...values, foremanUserId: values.foremanUserId || null });
}
