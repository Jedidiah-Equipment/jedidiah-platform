import type { JobDetail, JobUpdateInput, UUID } from '@pkg/schema';
import { IconTimeline } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton.js';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EditFormFullWidth, EditFormGrid } from '@/components/page-layout/EditFormLayout.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';

import { JobEditFormValues, toJobEditFormValues, toJobUpdateInput } from './components/job-edit-form.js';

type JobEditPageProps = {
  jobId: UUID;
};

export const JobEditPage: React.FC<JobEditPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const updateJobMutation = useMutation(
    trpc.jobs.update.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
      },
    }),
  );
  const job = jobQuery.data;

  return (
    <PageLayout description="Edit Job" size="md" title={job?.code ?? 'Loading job...'}>
      <div className="flex flex-col gap-6">
        {jobQuery.isPending ? <Skeleton className="h-32" /> : null}
        <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
        {job ? (
          <>
            <JobEditForm job={job} onSave={(value) => updateJobMutation.mutateAsync(value)} />
            <JobFeedbackCard job={job} />
          </>
        ) : null}
      </div>
    </PageLayout>
  );
};

const JobEditForm: React.FC<{
  job: JobDetail;
  onSave: (value: JobUpdateInput) => Promise<unknown>;
}> = ({ job, onSave }) => {
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: toJobEditFormValues(job),
    failureMessage: 'Unable to update job.',
    save: onSave,
    toInput: (value) => toJobUpdateInput(job.id, value),
    validator: JobEditFormValues,
  });

  return (
    <form {...formProps} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
        <Button render={<Link search={{ job: job.id }} to="/jobs" />} size="sm" variant="outline">
          <IconTimeline data-icon="inline-start" />
          View on Gantt
        </Button>
      </div>
      <EditFormGrid>
        <EditFormFullWidth>
          <form.AppField name="description">
            {(field) => <field.TextareaField label="Description" placeholder="Describe this job build..." rows={6} />}
          </form.AppField>
        </EditFormFullWidth>
        <form.AppField name="vinNumber">{(field) => <field.TextField label="VIN number" />}</form.AppField>
      </EditFormGrid>
    </form>
  );
};

const JobFeedbackCard: React.FC<{ job: JobDetail }> = ({ job }) => (
  <Card>
    <CardHeader className="grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <CardTitle>Feedback</CardTitle>
      <GiveFeedbackButton subject={{ subjectType: 'job', jobId: job.id }} subjectLabel={job.code} />
    </CardHeader>
    <CardSeparator />
    <CardContent>
      <JobFeedbackList canUpdateStatus jobId={job.id} />
    </CardContent>
  </Card>
);
