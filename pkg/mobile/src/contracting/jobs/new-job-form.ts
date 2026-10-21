import { UUID } from '@pkg/schema';
import { JobCreateInput, JobDescription } from '@pkg/schema/contracting';

/** The New job form as typed: an unchosen picker and an unchosen Foreman are both empty strings. */
export type JobDraft = {
  customerId: string;
  farmId: string;
  workTypeId: string;
  description: string;
  foremanUserId: string;
};

export const EMPTY_JOB_DRAFT: JobDraft = {
  customerId: '',
  farmId: '',
  workTypeId: '',
  description: '',
  foremanUserId: '',
};

const REQUIRED: readonly [keyof JobDraft, string][] = [
  ['customerId', 'Choose a Customer'],
  ['farmId', 'Choose a Farm'],
  ['workTypeId', 'Choose a Work Type'],
];

/** The Job this draft would create now, or the first thing it still needs, in the web form's words. */
export function deriveNewJob(
  draft: JobDraft,
  { canCreate, busy }: { canCreate: boolean; busy: boolean },
): { input: JobCreateInput | null; message?: string } {
  const missing = REQUIRED.find(([field]) => !UUID.safeParse(draft[field]).success);
  if (missing) return { input: null, message: missing[1] };
  if (!canCreate || busy) return { input: null };
  return {
    input: JobCreateInput.parse({
      customerId: draft.customerId,
      farmId: draft.farmId,
      workTypeId: draft.workTypeId,
      description: JobDescription.parse(draft.description.trim() || null),
      foremanUserId: draft.foremanUserId || null,
    }),
  };
}
