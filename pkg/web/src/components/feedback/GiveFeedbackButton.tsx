import { type FeedbackSubmitInput, FeedbackText } from '@pkg/schema';
import { IconMessagePlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { CreateEntityDialog } from '@/components/form/index.js';
import { Button } from '@/components/ui/button.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';

type FeedbackSubject = FeedbackSubmitInput['subject'];

const FeedbackFormValues = z.object({
  text: FeedbackText,
});
type FeedbackFormValues = z.infer<typeof FeedbackFormValues>;

const FEEDBACK_DEFAULT_VALUES: FeedbackFormValues = {
  text: '',
};

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
  const showMutationError = useApiMutationErrorToast();

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
        onCreate={(values) => submitFeedbackMutation.mutateAsync({ kind: 'general', subject, text: values.text })}
        onCreated={() => {
          setOpen(false);
          toast.success('Feedback submitted');
        }}
        onOpenChange={setOpen}
        open={open}
        submitLabel="Submit feedback"
        title="Give feedback"
        validator={FeedbackFormValues}
      >
        {(form) => (
          <form.AppField name="text">
            {(field) => <field.TextareaField label="Feedback" placeholder="Describe what you noticed…" rows={5} />}
          </form.AppField>
        )}
      </CreateEntityDialog>
    </>
  );
};
