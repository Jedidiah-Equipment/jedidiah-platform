import { DateOnlyIsoString, type Job, JobDescription, JobInvoiceNumber, JobUpdateInput, type UUID } from '@pkg/schema';
import { z } from 'zod';

import { emptyStringOr } from '@/components/form/utils/form-schema.js';

export type JobEditFormValues = z.infer<typeof JobEditFormValues>;
export const JobEditFormValues = z.object({
  completedOn: emptyStringOr(DateOnlyIsoString),
  description: emptyStringOr(JobDescription),
  invoiceNumber: emptyStringOr(JobInvoiceNumber),
});

/** Schema → form. Text and date inputs use `''` for blanks. */
export function toJobEditFormValues(
  job: Pick<Job, 'completedOn' | 'description' | 'invoiceNumber'>,
): JobEditFormValues {
  return {
    completedOn: job.completedOn ?? '',
    description: job.description ?? '',
    invoiceNumber: job.invoiceNumber ?? '',
  };
}

/** Form → schema. Parsing through `JobUpdateInput` applies the shared `''` → null transform. */
export function toJobUpdateInput(id: UUID, values: JobEditFormValues): JobUpdateInput {
  return JobUpdateInput.parse({
    id,
    // Clearing the picker reopens the Job; nothing else ever clears a completion date.
    completedOn: values.completedOn || null,
    description: values.description,
    invoiceNumber: values.invoiceNumber,
  });
}
