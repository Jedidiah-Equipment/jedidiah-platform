import type { QuoteSummary } from '@pkg/schema';
import type React from 'react';

import { JobCodeDisplay } from '@/pages/jobs/components/JobCodeDisplay.js';

type QuoteLinkedJobsProps = {
  canOpenJobs: boolean;
  linkedJobs: QuoteSummary['linkedJobs'];
};

export const QuoteLinkedJobs: React.FC<QuoteLinkedJobsProps> = ({ canOpenJobs, linkedJobs }) => {
  if (linkedJobs.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {linkedJobs.map((job) => (
        <JobCodeDisplay
          key={job.jobId}
          canOpenJob={canOpenJobs}
          jobCode={job.jobCode}
          jobId={job.jobId}
          withHoverCard
        />
      ))}
    </div>
  );
};
