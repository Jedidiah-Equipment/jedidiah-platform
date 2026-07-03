import type { JobFeedbackItem, UUID } from '@pkg/schema';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { FeedbackStatusBadge, FeedbackStatusSelect } from '@/components/feedback/FeedbackStatusBadge.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

type JobFeedbackListProps = {
  /** Render the status as a picker wired to `feedback.updateJobFeedback` instead of a read-only badge. */
  canUpdateStatus?: boolean;
  jobId: UUID;
};

/** A Job's public (general) feedback, oldest first. Corrective feedback never appears here. */
export const JobFeedbackList: React.FC<JobFeedbackListProps> = ({ canUpdateStatus = false, jobId }) => {
  const trpc = useTRPC();
  const feedbackQuery = useQuery(trpc.feedback.listJobFeedback.queryOptions({ jobId }));
  const items = feedbackQuery.data?.items ?? [];

  return (
    <div className="grid gap-2">
      <ErrorMessage error={feedbackQuery.error} fallbackMessage="Unable to load job feedback." />
      {feedbackQuery.isPending ? <Skeleton className="h-16" /> : null}
      {feedbackQuery.isSuccess && items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback submitted for this job.</p>
      ) : null}
      {items.map((item) => (
        <JobFeedbackCard canUpdateStatus={canUpdateStatus} item={item} key={item.id} />
      ))}
    </div>
  );
};

const JobFeedbackCard: React.FC<{ canUpdateStatus: boolean; item: JobFeedbackItem }> = ({ canUpdateStatus, item }) => (
  <article className="grid gap-2 rounded-lg border p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
        <EntityThumbnail label={item.submitter.name} size="sm" thumbnailDataUrl={item.submitter.thumbnailDataUrl} />
        <span className="truncate">{item.submitter.name}</span>
      </span>
      <span className="text-xs text-muted-foreground">
        <DateDisplay date={item.createdAt} />
      </span>
      <span className="ml-auto">
        {canUpdateStatus ? <JobFeedbackStatusSelect item={item} /> : <FeedbackStatusBadge status={item.status} />}
      </span>
    </div>
    <p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>
  </article>
);

const JobFeedbackStatusSelect: React.FC<{ item: JobFeedbackItem }> = ({ item }) => {
  const trpc = useTRPC();
  const { invalidateFeedback } = useQueryInvalidation();
  const showMutationError = useApiMutationErrorToast();
  const updateMutation = useMutation(
    trpc.feedback.updateJobFeedback.mutationOptions({
      onSuccess: () => invalidateFeedback(),
      onError: (error) => {
        showMutationError(error, 'Unable to update feedback status.');
      },
    }),
  );

  return (
    <FeedbackStatusSelect
      disabled={updateMutation.isPending}
      value={item.status}
      onValueChange={(status) => updateMutation.mutate({ id: item.id, status })}
    />
  );
};
