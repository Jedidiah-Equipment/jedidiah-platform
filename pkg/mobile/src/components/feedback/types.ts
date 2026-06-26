import {
  AuthId,
  Department,
  FeedbackDepartmentTargets,
  FeedbackKind,
  type FeedbackSubmitInput,
  FeedbackText,
  FeedbackUserTargets,
} from '@pkg/schema';
import { z } from 'zod';

// Mobile mirror of pkg/web's feedback form-values schema. Per-field constraints come
// from @pkg/schema (single source); this only adds the UI shape + the per-kind target
// cardinality rule, reusing the exported target schemas so the message matches the API.
export type FeedbackFormValues = z.infer<typeof FeedbackFormValues>;
export const FeedbackFormValues = z
  .object({
    kind: FeedbackKind,
    text: FeedbackText,
    departments: z.array(Department),
    userIds: z.array(AuthId),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'corrective-feedback-department') {
      forwardTargetIssues(FeedbackDepartmentTargets.safeParse(value.departments), 'departments', ctx);
    }
    if (value.kind === 'corrective-feedback-user') {
      forwardTargetIssues(FeedbackUserTargets.safeParse(value.userIds), 'userIds', ctx);
    }
  });

function forwardTargetIssues(
  result: z.ZodSafeParseResult<unknown>,
  field: 'departments' | 'userIds',
  ctx: z.RefinementCtx,
): void {
  if (result.success) {
    return;
  }

  for (const issue of result.error.issues) {
    ctx.addIssue({ code: 'custom', message: issue.message, path: [field, ...issue.path] });
  }
}

export const FEEDBACK_DEFAULT_VALUES: FeedbackFormValues = {
  kind: 'general',
  text: '',
  departments: [],
  userIds: [],
};

/** Map the form values to the API payload. Mobile feedback is always about a job. */
export function toSubmitInput(values: FeedbackFormValues, jobId: string): FeedbackSubmitInput {
  const subject = { subjectType: 'job', jobId } as const;

  if (values.kind === 'corrective-feedback-department') {
    return { kind: values.kind, subject, text: values.text, departments: values.departments };
  }
  if (values.kind === 'corrective-feedback-user') {
    return { kind: values.kind, subject, text: values.text, userIds: values.userIds };
  }
  return { kind: 'general', subject, text: values.text };
}
