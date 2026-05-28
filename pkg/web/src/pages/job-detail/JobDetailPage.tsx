import type { JobDetail, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { BackButton } from '@/components/button/BackButton.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DetailPageLayout } from '@/components/page-layout/DetailPageLayout.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobFact } from './components/JobFact.js';

type JobDetailPageProps = {
  jobId: UUID;
};

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;
  return (
    <DetailPageLayout
      back={<BackButton to="/jobs">Jobs</BackButton>}
      description={job?.quoteCode ?? undefined}
      title={job?.code}
    >
      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
      {job ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <JobFact label="Quote code" value={job.quoteCode ?? 'Quote linked'} />
            <JobFact label="Job code" value={<span className="font-medium">{job.code}</span>} />
            <JobFact label="Customer name" value={job.customerCompanyName ?? 'Customer unavailable'} />
            <JobFact label="Product name" value={job.productName} />
          </div>
          <JobCfoDump cfo={job.cfo} />
        </>
      ) : null}
      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
    </DetailPageLayout>
  );
};

const JobCfoDump: React.FC<{
  cfo: JobDetail['cfo'];
}> = ({ cfo }) => {
  if (cfo.length === 0) {
    return (
      <section className="grid gap-2">
        <h2 className="font-heading text-base font-medium">CFO dump</h2>
        <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">No assemblies captured.</p>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-base font-medium">CFO dump</h2>
      <div className="grid gap-3">
        {cfo.map((assembly) => (
          <div className="overflow-hidden rounded-lg border" key={`${assembly.kind}-${assembly.assemblyName}`}>
            <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-3 py-2">
              <h3 className="font-medium">{assembly.assemblyName}</h3>
              <span className="text-xs font-medium text-muted-foreground capitalize">{assembly.kind}</span>
            </div>
            {assembly.parts.length > 0 ? (
              <div className="divide-y text-sm">
                {assembly.parts.map((part) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-3 px-3 py-2" key={part.partId}>
                    <div className="min-w-0">
                      <div className="truncate font-medium">{part.partName}</div>
                      <div className="truncate text-muted-foreground">{part.partCode}</div>
                    </div>
                    <div className="text-right tabular-nums">{part.quantity}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">No parts captured.</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
