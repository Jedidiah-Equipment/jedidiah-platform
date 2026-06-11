import type { QuoteSummary } from '@pkg/schema';
import type React from 'react';

import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';

type QuoteLinkedJobProps = {
  canOpenJobs: boolean;
  job: QuoteSummary['job'];
};

export const QuoteLinkedJob: React.FC<QuoteLinkedJobProps> = ({ canOpenJobs, job }) => {
  if (!job) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <JobCodeDisplay canOpenJob={canOpenJobs} jobCode={job.jobCode} jobId={job.jobId} withHoverCard />
    </div>
  );
};
