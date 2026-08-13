import type { JobFeedbackItem, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Card, CardContent } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';

type JobFeedbackListProps = {
  jobId: UUID;
};

/**
 * A Job's public (general) feedback, newest first. Corrective feedback never appears here.
 *
 * General feedback carries a status in the data and on `feedback.updateJobFeedback`, but the card
 * does not show it: a note on the shop floor is read, not triaged, and a row of Open pills says
 * nothing anybody acts on. Triage stays on the `/feedback` inbox, where it means something.
 */
export const JobFeedbackList: React.FC<JobFeedbackListProps> = ({ jobId }) => {
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
        <JobFeedbackCard item={item} key={item.id} />
      ))}
    </div>
  );
};

const JobFeedbackCard: React.FC<{ item: JobFeedbackItem }> = ({ item }) => (
  <Card size="sm">
    <CardContent>
      <article className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
            <EntityThumbnail label={item.submitter.name} size="sm" thumbnailDataUrl={item.submitter.thumbnailDataUrl} />
            <span className="truncate">{item.submitter.name}</span>
          </span>
          <span className="text-xs text-muted-foreground">
            <DateDisplay date={item.createdAt} />
          </span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6">{item.text}</p>
      </article>
    </CardContent>
  </Card>
);
