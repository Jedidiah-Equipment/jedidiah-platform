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
    <PageLayout
      actions={job ? <ViewOnPlannerButton jobId={job.id} /> : undefined}
      description="Edit Job"
      size="md"
      title={job?.code ?? 'Loading job...'}
    >
      <div className="flex flex-col gap-6">
        {jobQuery.isPending ? <Skeleton className="h-32" /> : null}
        <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
        {job ? (
          <>
            <JobEditForm key={job.id} job={job} onSave={(value) => updateJobMutation.mutateAsync(value)} />
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
      <div className="flex items-center justify-end gap-3">
        <AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />
      </div>
      <EditFormGrid>
        <EditFormFullWidth>
          <Card>
            <CardContent className="grid gap-5">
              <form.AppField name="description">
                {(field) => (
                  <field.TextareaField label="Description" placeholder="Describe this job build..." rows={6} />
                )}
              </form.AppField>
              {job.quoteKind === 'product' ? (
                <form.AppField name="vinNumber">{(field) => <field.TextField label="VIN number" />}</form.AppField>
              ) : null}
            </CardContent>
          </Card>
        </EditFormFullWidth>
      </EditFormGrid>
    </form>
  );
};

const ViewOnPlannerButton: React.FC<{ jobId: UUID }> = ({ jobId }) => (
  <Button render={<Link search={{ job: jobId }} to="/jobs" />} size="sm" variant="outline">
    <IconTimeline data-icon="inline-start" />
    View on Planner
  </Button>
);

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
