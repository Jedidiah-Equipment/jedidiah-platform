import { type Job, JobDescription, JobUpdateInput, JobVinNumber, type UUID } from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

export type JobEditFormValues = z.infer<typeof JobEditFormValues>;
export const JobEditFormValues = z.object({
  description: emptyStringOr(JobDescription),
  vinNumber: emptyStringOr(JobVinNumber),
});

/** Schema → form. Text inputs use `''` for blanks. */
export function toJobEditFormValues(job: Pick<Job, 'description' | 'vinNumber'>): JobEditFormValues {
  return {
    description: job.description ?? '',
    vinNumber: job.vinNumber ?? '',
  };
}

/** Form → schema. Parsing through `JobUpdateInput` applies the shared `''` → null transform. */
export function toJobUpdateInput(id: UUID, values: JobEditFormValues): JobUpdateInput {
  return JobUpdateInput.parse({
    id,
    description: values.description,
    vinNumber: values.vinNumber,
  });
}
