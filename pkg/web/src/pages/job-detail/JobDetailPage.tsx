import { hasPermission } from '@pkg/domain';
import type { JobDetail, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobFact } from './components/JobFact.js';
import { StagePanel } from './components/StagePanel.js';

type JobDetailPageProps = {
  jobId: UUID;
};

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const accessQuery = useAccess();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;
  const isTransitionPending = false;
  const canSeeQuotes = hasPermission(accessQuery.data, 'quote:read') || hasPermission(accessQuery.data, 'quote:update');
  return (
    <DetailPageLayout
      back={<BackButton to="/jobs">Jobs</BackButton>}
      description={job?.productModelCode}
      title={job?.productName}
    >
      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
      {job ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <JobFact label="Job code" value={<span className="font-medium">{job.code}</span>} />
            <JobFact label="Customer" value={job.customerCompanyName ?? 'Stock build'} />
            <JobFact label="Created" value={<DateDisplay date={job.createdAt} />} />
            <JobFact label="Updated" value={<DateDisplay date={job.updatedAt} />} />
            <JobFact label="Quote" value={<JobQuoteCode canSeeQuote={canSeeQuotes} quoteCode={job.quoteCode} />} />
          </div>
          <div className="grid gap-3 lg:grid-cols-5">
            {job.stages.map((stage) => (
              <StagePanel isPending={isTransitionPending} key={`${stage.sequence}-${stage.stage}`} stage={stage} />
            ))}
          </div>
        </>
      ) : null}
      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
    </DetailPageLayout>
  );
};

const JobQuoteCode: React.FC<{
  canSeeQuote: boolean;
  quoteCode: JobDetail['quoteCode'];
}> = ({ canSeeQuote, quoteCode }) => {
  if (!quoteCode) {
    return <span>Direct job</span>;
  }

  if (!canSeeQuote) {
    return <span className="text-muted-foreground">Quote linked</span>;
  }

  return <span>{quoteCode}</span>;
};
