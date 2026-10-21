import { type JobCreateInput, JobCreateValues, toJobCreateInput } from '@pkg/schema/contracting';

export const EMPTY_JOB_DRAFT: JobCreateValues = {
  customerId: '',
  farmId: '',
  workTypeId: '',
  description: '',
  foremanUserId: '',
};

/** The Job this draft would create now, or the first thing it still needs, in the shared form's words. */
export function deriveNewJob(
  draft: JobCreateValues,
  { canCreate, busy }: { canCreate: boolean; busy: boolean },
): { input: JobCreateInput | null; message?: string } {
  const parsed = JobCreateValues.safeParse(draft);
  if (!parsed.success) return { input: null, message: parsed.error.issues[0]?.message ?? 'Complete the form' };
  if (!canCreate || busy) return { input: null };
  return { input: toJobCreateInput(parsed.data) };
}
