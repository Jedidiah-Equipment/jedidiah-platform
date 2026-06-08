import { PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDetail, JobDocument, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';
import { JobFact } from './components/JobFact.js';

type JobDetailPageProps = {
  jobId: UUID;
};

export const JobDetailPage: React.FC<JobDetailPageProps> = ({ jobId }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const job = jobQuery.data;
  return (
    <PageLayout description={job?.quoteCode} size="md" title={job?.code}>
      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
      {job ? (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <JobFact label="Quote code" value={job.quoteCode} />
            <JobFact label="Job code" value={<span className="font-medium">{job.code}</span>} />
            <JobFact label="Product serial" value={<span className="font-medium">{job.productSerialNumber}</span>} />
            <JobFact label="Customer name" value={job.customerCompanyName ?? 'Customer unavailable'} />
            <JobFact label="Product name" value={job.productName} />
          </div>
          <JobCfoDump cfo={job.cfo} />
          <JobDocuments documents={job.documents} jobId={job.id} />
        </>
      ) : null}
      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
    </PageLayout>
  );
};

const JobDocuments: React.FC<{
  documents: JobDetail['documents'];
  jobId: UUID;
}> = ({ documents, jobId }) => {
  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-base font-medium">Documents</h2>
      <DocumentCardList
        documents={documents}
        emptyMessage="No documents captured."
        isLoading={false}
        metadata={jobDocumentMetadata}
        owner={{ id: jobId, type: 'job' }}
      />
    </section>
  );
};

const jobDocumentMetadata = {
  getSearchText: (document: JobDocument) =>
    `${PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]} ${document.sourceProductName}`,
  render: (document: JobDocument) => (
    <span>
      {PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]}
      <span className="font-normal text-muted-foreground"> from {document.sourceProductName}</span>
    </span>
  ),
};

const JobCfoDump: React.FC<{
  cfo: JobDetail['cfo'];
}> = ({ cfo }) => {
  if (cfo.length === 0) {
    return (
      <section className="grid gap-2">
        <h2 className="font-heading text-base font-medium">CFO dump</h2>
        <Card size="sm">
          <CardContent className="text-muted-foreground">No assemblies captured.</CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-3">
      <h2 className="font-heading text-base font-medium">CFO dump</h2>
      <div className="grid gap-3">
        {cfo.map((assembly) => (
          <Card key={`${assembly.kind}-${assembly.assemblyName}`} size="sm">
            <CardHeader>
              <CardTitle>{assembly.assemblyName}</CardTitle>
              <CardAction span="title">
                <span className="text-xs font-medium text-muted-foreground capitalize">{assembly.kind}</span>
              </CardAction>
            </CardHeader>
            {assembly.parts.length > 0 ? (
              <CardContent>
                <div className="divide-y text-sm">
                  {assembly.parts.map((part) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_4rem] gap-3 py-2" key={part.partId}>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{part.partName}</div>
                        <div className="truncate text-muted-foreground">{part.partCode}</div>
                      </div>
                      <div className="text-right tabular-nums">
                        {formatPartQuantity(part.quantity, part.unitOfMeasure)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : (
              <CardContent className="text-muted-foreground">No parts captured.</CardContent>
            )}
          </Card>
        ))}
      </div>
    </section>
  );
};
