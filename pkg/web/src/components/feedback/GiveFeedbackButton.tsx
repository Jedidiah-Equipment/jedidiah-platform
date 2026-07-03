import { departmentLabels, getFeedbackVisibilityNotice } from '@pkg/domain';
import {
  AuthId,
  DEPARTMENTS,
  Department,
  FeedbackDepartmentTargets,
  FeedbackKind,
  type FeedbackSubmitInput,
  FeedbackText,
  FeedbackUserTargets,
} from '@pkg/schema';
import { IconMessagePlus } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { FeedbackVisibilityBanner } from '@/components/feedback/FeedbackVisibilityBanner.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

type FeedbackSubject = FeedbackSubmitInput['subject'];

const FeedbackFormValues = z
  .object({
    kind: FeedbackKind,
    text: FeedbackText,
    departments: z.array(Department),
    userIds: z.array(AuthId),
  })
  .superRefine((value, ctx) => {
    // Reuse the exported target schemas so the dialog enforces the same cardinality rule and message
    // as `feedback.submit` rather than re-declaring it here.
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
type FeedbackFormValues = z.infer<typeof FeedbackFormValues>;

const FEEDBACK_DEFAULT_VALUES: FeedbackFormValues = {
  kind: 'general',
  text: '',
  departments: [],
  userIds: [],
};

const FEEDBACK_KIND_OPTIONS: ReadonlyArray<{ label: string; value: FeedbackKind }> = [
  { label: 'General feedback', value: 'general' },
  { label: 'Corrective — Departments', value: 'corrective-feedback-department' },
  { label: 'Corrective — Users', value: 'corrective-feedback-user' },
];

const DEPARTMENT_OPTIONS = DEPARTMENTS.map((department) => ({
  label: departmentLabels[department],
  value: department,
}));

type GiveFeedbackButtonProps = {
  className?: string;
  size?: React.ComponentProps<typeof Button>['size'];
  subject: FeedbackSubject;
  subjectLabel: string;
  variant?: React.ComponentProps<typeof Button>['variant'];
};

export const GiveFeedbackButton: React.FC<GiveFeedbackButtonProps> = ({
  className,
  size = 'sm',
  subject,
  subjectLabel,
  variant = 'outline',
}) => {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const { invalidateFeedback } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();

  const targetUsersQuery = useQuery(trpc.feedback.listTargetUsers.queryOptions(undefined, { enabled: open }));
  const userOptions = (targetUsersQuery.data?.users ?? []).map((user) => ({ label: user.name, value: user.id }));

  const submitFeedbackMutation = useMutation(
    trpc.feedback.submit.mutationOptions({
      onError: (error) => {
        showMutationError(error, 'Unable to submit feedback.');
      },
    }),
  );

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} size={size} variant={variant}>
        <IconMessagePlus data-icon="inline-start" />
        Send Feedback
      </Button>
      <CreateEntityDialog
        defaultValues={FEEDBACK_DEFAULT_VALUES}
        description={`Share feedback about ${subjectLabel}. Once submitted it goes to the review queue.`}
        key={open ? 'open' : 'closed'}
        onCreate={(values) => submitFeedbackMutation.mutateAsync(toSubmitInput(values, subject))}
        onCreated={async () => {
          setOpen(false);
          toast.success('Feedback submitted');
          await invalidateFeedback();
        }}
        onOpenChange={setOpen}
        open={open}
        submitLabel={(values) => getFeedbackVisibilityNotice(values.kind, subject.subjectType).submitLabel}
        title="Send feedback"
        validator={FeedbackFormValues}
      >
        {(form) => (
          <>
            <form.AppField name="kind">
              {(field) => <field.SelectField label="Kind" options={FEEDBACK_KIND_OPTIONS} />}
            </form.AppField>
            <form.Subscribe selector={(state) => state.values.kind}>
              {(kind) => <FeedbackVisibilityBanner kind={kind} subjectType={subject.subjectType} />}
            </form.Subscribe>
            <form.Subscribe selector={(state) => state.values.kind}>
              {(kind) =>
                kind === 'corrective-feedback-department' ? (
                  <form.AppField name="departments">
                    {(field) => (
                      <field.MultiComboboxField
                        label="Departments"
                        options={DEPARTMENT_OPTIONS}
                        placeholder="Select departments…"
                      />
                    )}
                  </form.AppField>
                ) : kind === 'corrective-feedback-user' ? (
                  <form.AppField name="userIds">
                    {(field) => (
                      <field.MultiComboboxField
                        emptyMessage={targetUsersQuery.isPending ? 'Loading users…' : 'No users available.'}
                        label="Users"
                        options={userOptions}
                        placeholder="Select users…"
                      />
                    )}
                  </form.AppField>
                ) : null
              }
            </form.Subscribe>
            <form.AppField name="text">
              {(field) => <field.TextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} />}
            </form.AppField>
          </>
        )}
      </CreateEntityDialog>
    </>
  );
};

function toSubmitInput(values: FeedbackFormValues, subject: FeedbackSubject): FeedbackSubmitInput {
  if (values.kind === 'corrective-feedback-department') {
    return { kind: values.kind, subject, text: values.text, departments: values.departments };
  }
  if (values.kind === 'corrective-feedback-user') {
    return { kind: values.kind, subject, text: values.text, userIds: values.userIds };
  }
  return { kind: 'general', subject, text: values.text };
}
