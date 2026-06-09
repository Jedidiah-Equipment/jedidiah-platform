import { formatDate, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDetail, JobDocument, UUID } from '@pkg/schema';
import { IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useTRPC } from '@/lib/trpc.js';
import { findJobScheduleSummary, type JobScheduleSummary } from './bay-schedule-summary.js';

type JobDetailAsideProps = {
  bayId?: UUID | undefined;
  jobId: UUID;
  onClose: () => void;
};

export const JobDetailAside: React.FC<JobDetailAsideProps> = ({ bayId, jobId, onClose }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const job = jobQuery.data;
  const schedule = baysQuery.data
    ? findJobScheduleSummary(baysQuery.data.items, baysQuery.data.offDays, jobId, bayId)
    : null;

  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EntityThumbnail
            className="shrink-0"
            label={job?.productName || job?.code || 'Job'}
            size="lg"
            thumbnailDataUrl={job?.productThumbnailDataUrl}
          />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="truncate text-lg font-medium leading-tight font-mono">{job?.code ?? 'Job'}</h2>
            {job?.quoteCode ? (
              <p className="truncate text-sm text-muted-foreground font-mono">{job.quoteCode}</p>
            ) : null}
          </div>
        </div>
        <Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
          <IconX />
        </Button>
      </div>

      <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />

      {schedule ? <SlotSection schedule={schedule} /> : null}
      {job ? <JobSection job={job} /> : null}
      {job ? <JobDocuments documents={job.documents} jobId={job.id} /> : null}

      {jobQuery.isLoading ? <Skeleton className="h-48" /> : null}
    </div>
  );
};

const Section: React.FC<{ children: React.ReactNode; title: string }> = ({ children, title }) => (
  <section className="grid gap-2">
    <h3 className="font-heading text-base font-medium">{title}</h3>
    {children}
  </section>
);

const InfoList: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="divide-y rounded-lg border text-sm">{children}</dl>
);

const InfoRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-3 px-3 py-2">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 text-right">{value}</dd>
  </div>
);

const SlotSection: React.FC<{ schedule: JobScheduleSummary }> = ({ schedule }) => {
  const { dayBreakdown, endAt, startAt } = schedule;
  const totalDays = dayBreakdown.workingDays + dayBreakdown.closureDays;

  return (
    <Section title="Slot">
      <InfoList>
        <InfoRow label="Start" value={formatDate(startAt, 'short')} />
        <InfoRow label="End" value={formatDate(endAt, 'short')} />
        <InfoRow label="Total days" value={`${totalDays} (incl. off)`} />
        <InfoRow label="Working days" value={dayBreakdown.workingDays} />
        {dayBreakdown.overtimeDays > 0 ? (
          <InfoRow label="Overtime" value={`${dayBreakdown.overtimeDays} day(s)`} />
        ) : null}
        {dayBreakdown.closureDays > 0 ? <InfoRow label="Closure" value={`${dayBreakdown.closureDays} day(s)`} /> : null}
      </InfoList>
    </Section>
  );
};

const JobSection: React.FC<{ job: JobDetail }> = ({ job }) => (
  <Section title="Job">
    <InfoList>
      <InfoRow label="Quote code" value={job.quoteCode ?? 'Direct job'} />
      <InfoRow label="Job code" value={job.code} />
      <InfoRow label="Product serial" value={job.productSerialNumber} />
      <InfoRow label="Customer" value={job.customerCompanyName ?? 'Customer unavailable'} />
      <InfoRow label="Product" value={job.productName} />
    </InfoList>
  </Section>
);

const JobDocuments: React.FC<{
  documents: JobDetail['documents'];
  jobId: UUID;
}> = ({ documents, jobId }) => (
  <Section title="Documents">
    <DocumentCardList
      documents={documents}
      emptyMessage="No documents captured."
      isLoading={false}
      metadata={jobDocumentMetadata}
      owner={{ id: jobId, type: 'job' }}
    />
  </Section>
);

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
