import { departmentLabels, formatDate, PRODUCT_DOCUMENT_TYPE_LABELS } from '@pkg/domain';
import type { JobDetail, JobDocument, UUID } from '@pkg/schema';
import { IconPencil, IconX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton.js';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useBayCalendars } from '@/hooks/use-bay-calendars.js';
import { useTRPC } from '@/lib/trpc.js';
import { findJobScheduleSummary, type JobScheduleSummary } from './board-summary.js';
import { InfoList, InfoRow, SlotDayBreakdownRows } from './JobInfoList.js';
import { getJobDisplayName } from './job-display.js';

type JobDetailAsideProps = {
  bayId?: UUID | undefined;
  jobId: UUID;
  onClose: () => void;
};

export const JobDetailAside: React.FC<JobDetailAsideProps> = ({ bayId, jobId, onClose }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());
  const bayCalendars = useBayCalendars();
  const job = jobQuery.data;
  const schedule =
    baysQuery.data && bayCalendars
      ? findJobScheduleSummary(baysQuery.data.items, bayCalendars.workingCalendarsByBayId, jobId, bayId)
      : null;

  return (
    <div className="flex flex-col gap-5 rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <EntityThumbnail
            className="shrink-0"
            label={job ? getJobDisplayName(job) : 'Job'}
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

      {job ? (
        <div className="flex flex-wrap items-center gap-2">
          <GiveFeedbackButton subject={{ subjectType: 'job', jobId: job.id }} subjectLabel={job.code} />
          <JobEditLink jobId={job.id} />
        </div>
      ) : null}

      {schedule ? <SlotSection schedule={schedule} /> : null}
      {job ? <JobSection job={job} /> : null}
      {job ? <JobFeedbackSection jobId={job.id} /> : null}
      {job ? <JobScheduleSection job={job} /> : null}
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

const SlotSection: React.FC<{ schedule: JobScheduleSummary }> = ({ schedule }) => {
  const { currentOperator, dayBreakdown, endDate, startDate } = schedule;

  return (
    <Section title="Slot">
      <InfoList>
        {currentOperator ? <InfoRow label="Operator" value={<OperatorValue operator={currentOperator} />} /> : null}
        <SlotDayBreakdownRows dayBreakdown={dayBreakdown} endDate={endDate} startDate={startDate} />
      </InfoList>
    </Section>
  );
};

const OperatorValue: React.FC<{ operator: NonNullable<JobScheduleSummary['currentOperator']> }> = ({ operator }) => (
  <span className="inline-flex min-w-0 items-center justify-end gap-2">
    <EntityThumbnail
      className="shrink-0"
      label={operator.name}
      size="sm"
      thumbnailDataUrl={operator.thumbnailDataUrl}
    />
    <span className="min-w-0 truncate">{operator.name}</span>
  </span>
);

const JobEditLink: React.FC<{ jobId: UUID }> = ({ jobId }) => {
  const canEditJobs = useCan('job:update').can;

  if (!canEditJobs) {
    return null;
  }

  return (
    <Button render={<Link params={{ id: jobId }} to="/jobs/$id/edit" />} size="sm" variant="outline">
      <IconPencil data-icon="inline-start" />
      Edit Job
    </Button>
  );
};

const JobSection: React.FC<{ job: JobDetail }> = ({ job }) => {
  const displayName = getJobDisplayName(job);

  return (
    <Section title="Job">
      <InfoList>
        <InfoRow label="Quote code" value={job.quoteCode ?? 'Direct job'} />
        <InfoRow label="Job code" value={job.code} />
        {job.productSerialNumber ? <InfoRow label="Product serial" value={job.productSerialNumber} /> : null}
        <InfoRow label="Customer" value={job.customerCompanyName ?? 'Customer unavailable'} />
        <InfoRow label={job.quoteKind === 'custom' ? 'Work title' : 'Product'} value={displayName} />
        {job.productModelCode ? <InfoRow label="Model" value={job.productModelCode} /> : null}
        {job.quoteKind === 'product' && job.vinNumber ? <InfoRow label="VIN number" value={job.vinNumber} /> : null}
      </InfoList>
      {job.description ? <p className="whitespace-pre-wrap text-sm leading-6">{job.description}</p> : null}
    </Section>
  );
};

const JobFeedbackSection: React.FC<{ jobId: UUID }> = ({ jobId }) => (
  <Section title="Feedback">
    <JobFeedbackList jobId={jobId} />
  </Section>
);

const JobScheduleSection: React.FC<{ job: JobDetail }> = ({ job }) => (
  <Section title="Schedule">
    <div className="grid gap-2 text-sm">
      {job.schedule.map((department) => (
        <div className="rounded-lg border p-3" key={department.department}>
          <div className="font-medium">{departmentLabels[department.department]}</div>
          {department.bays.length === 0 ? (
            <div className="mt-1 text-muted-foreground">No slots scheduled.</div>
          ) : (
            <div className="mt-2 grid gap-2">
              {department.bays.map((bay) => (
                <div className="grid gap-1" key={bay.id}>
                  <div className="text-muted-foreground">{bay.name}</div>
                  {bay.slots.map((slot) => (
                    <div className="flex items-center justify-between gap-3" key={slot.id}>
                      <span>{formatDate(slot.startDate, 'short')}</span>
                      <span className="text-muted-foreground">to</span>
                      <span>{formatDate(slot.endDate, 'short')}</span>
                      <span className="ml-auto tabular-nums">{slot.durationDays}d</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
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
    `${PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]} ${document.sourceProductName ?? ''}`,
  render: (document: JobDocument) => (
    <span>
      {PRODUCT_DOCUMENT_TYPE_LABELS[document.metadata.type]}
      {document.sourceProductName ? (
        <span className="font-normal text-muted-foreground"> from {document.sourceProductName}</span>
      ) : null}
    </span>
  ),
};
