import {
  departmentLabels,
  formatDate,
  getJobDisplayName,
  getJobWorkLabel,
  PRODUCT_DOCUMENT_TYPE_LABELS,
} from '@pkg/domain';
import type { JobDetail, JobDocument, JobUpdateInput, UUID } from '@pkg/schema';
import { IconInfoCircle, IconMessageCircle } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';

import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { DocumentCardList } from '@/components/documents/DocumentCardList.js';
import { GiveFeedbackButton } from '@/components/feedback/GiveFeedbackButton.js';
import { JobFeedbackList } from '@/components/feedback/JobFeedbackList.js';
import { AutosaveStatus, useAutosaveForm } from '@/components/form/index.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardAction, CardContent, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Skeleton } from '@/components/ui/skeleton.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useCan } from '@/hooks/use-access.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import { InfoList, InfoRow } from './JobInfoList.js';
import { JobEditFormValues, toJobEditFormValues, toJobUpdateInput } from './job-edit-form.js';
import { scheduleBadgeToneClass, scheduleBarToneClass, scheduleDotToneClass } from './schedule-state-tone.js';

type JobSheetTab = 'details' | 'documents' | 'schedule';

type JobSheetProps = {
  jobId: UUID;
  onClose: () => void;
};

export const JobSheet: React.FC<JobSheetProps> = ({ jobId, onClose }) => {
  const trpc = useTRPC();
  const jobQuery = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const [tab, setTab] = useState<JobSheetTab>('details');

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent
        className="gap-0 p-0 data-[side=right]:!w-[min(100vw,42rem)] data-[side=right]:!max-w-[42rem]"
        side="right"
      >
        <JobSheetHeader job={jobQuery.data} />
        <ErrorMessage error={jobQuery.error} fallbackMessage="Unable to load job." />
        {jobQuery.isPending ? <JobSheetSkeleton /> : null}
        {jobQuery.data ? (
          <Tabs className="min-h-0 flex-1 gap-0" onValueChange={(value) => setTab(value as JobSheetTab)} value={tab}>
            <div className="px-4 pt-5 pb-0">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="documents">Documents</TabsTrigger>
                <TabsTrigger value="schedule">Schedule</TabsTrigger>
              </TabsList>
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <TabsContent className="p-4" value="details">
                <JobDetailsTab key={jobQuery.data.id} job={jobQuery.data} />
              </TabsContent>
              <TabsContent className="p-4" value="documents">
                <JobDocumentsTab documents={jobQuery.data.documents} jobId={jobQuery.data.id} />
              </TabsContent>
              <TabsContent className="p-4" value="schedule">
                <JobScheduleTab job={jobQuery.data} />
              </TabsContent>
            </ScrollArea>
          </Tabs>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};

const JobSheetHeader: React.FC<{ job: JobDetail | undefined }> = ({ job }) => (
  <SheetHeader className="border-b pr-12">
    <div className="flex min-w-0 items-center gap-3">
      <EntityThumbnail
        className="shrink-0"
        label={job ? getJobDisplayName(job) : 'Job'}
        size="lg"
        thumbnailDataUrl={job?.productThumbnailDataUrl}
      />
      <div className="min-w-0">
        <SheetTitle className="truncate font-mono text-lg">{job?.code ?? 'Job'}</SheetTitle>
        <SheetDescription className="truncate font-mono">{job?.quoteCode ?? 'Loading job...'}</SheetDescription>
      </div>
    </div>
  </SheetHeader>
);

const JobDetailsTab: React.FC<{ job: JobDetail }> = ({ job }) => {
  const trpc = useTRPC();
  const canEditJobs = useCan('job:update').can;
  const { invalidateJobs } = useQueryInvalidation();
  const updateJobMutation = useMutation(
    trpc.jobs.update.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
      },
    }),
  );

  return (
    <div className="grid gap-5">
      {canEditJobs ? (
        <EditableJobDetails job={job} onSave={(value) => updateJobMutation.mutateAsync(value)} />
      ) : (
        <ReadOnlyJobDetails job={job} />
      )}
      <Section
        action={<GiveFeedbackButton subject={{ subjectType: 'job', jobId: job.id }} subjectLabel={job.code} />}
        icon={<IconMessageCircle />}
        title="Feedback"
      >
        <JobFeedbackList canUpdateStatus={canEditJobs} jobId={job.id} />
      </Section>
    </div>
  );
};

const EditableJobDetails: React.FC<{
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
    <form {...formProps}>
      <Section
        action={<AutosaveStatus onRetry={() => void autosave.retry()} state={autosave.state} />}
        contentClassName="p-0"
        icon={<IconInfoCircle />}
        title="Details"
      >
        <InfoList className="rounded-none border-0">
          <ImmutableJobRows job={job} />
          <EditableInfoRow label="Invoice number">
            <form.AppField name="invoiceNumber">
              {(field) => (
                <field.TextField aria-label="Invoice number" label={<span className="sr-only">Invoice number</span>} />
              )}
            </form.AppField>
          </EditableInfoRow>
          <EditableInfoRow label="Description">
            <form.AppField name="description">
              {(field) => (
                <field.TextareaField
                  aria-label="Description"
                  className="min-h-24 text-left"
                  placeholder="Describe this job build..."
                  rows={4}
                />
              )}
            </form.AppField>
          </EditableInfoRow>
          {job.quoteKind === 'product' ? (
            <EditableInfoRow label="VIN number">
              <form.AppField name="vinNumber">
                {(field) => (
                  <field.TextField aria-label="VIN number" label={<span className="sr-only">VIN number</span>} />
                )}
              </form.AppField>
            </EditableInfoRow>
          ) : null}
        </InfoList>
      </Section>
    </form>
  );
};

const ReadOnlyJobDetails: React.FC<{ job: JobDetail }> = ({ job }) => (
  <Section contentClassName="p-0" icon={<IconInfoCircle />} title="Details">
    <InfoList className="rounded-none border-0">
      <ImmutableJobRows job={job} />
      <InfoRow label="Invoice number" value={job.invoiceNumber ?? 'Not captured'} />
      <InfoRow
        label="Description"
        value={
          job.description ? (
            <span className="whitespace-pre-wrap text-left leading-6">{job.description}</span>
          ) : (
            <span className="text-muted-foreground">No description</span>
          )
        }
      />
      {job.quoteKind === 'product' ? <InfoRow label="VIN number" value={job.vinNumber ?? 'Not captured'} /> : null}
    </InfoList>
  </Section>
);

const ImmutableJobRows: React.FC<{ job: JobDetail }> = ({ job }) => {
  const displayName = getJobDisplayName(job);

  return (
    <>
      <InfoRow label="Quote code" value={job.quoteCode ?? 'Direct job'} />
      <InfoRow label="Job code" value={job.code} />
      {job.productSerialNumber ? <InfoRow label="Product serial" value={job.productSerialNumber} /> : null}
      <InfoRow label="Customer" value={job.customerCompanyName ?? 'Customer unavailable'} />
      <InfoRow label={getJobWorkLabel(job)} value={displayName} />
      {job.productModelCode ? <InfoRow label="Model" value={job.productModelCode} /> : null}
    </>
  );
};

const EditableInfoRow: React.FC<{ children: React.ReactNode; label: string }> = ({ children, label }) => (
  <div className="grid gap-2 px-3 py-3">
    <div className="text-muted-foreground">{label}</div>
    <div className="min-w-0">{children}</div>
  </div>
);

const JobDocumentsTab: React.FC<{
  documents: JobDetail['documents'];
  jobId: UUID;
}> = ({ documents, jobId }) => (
  <DocumentCardList
    documents={documents}
    emptyMessage="No documents captured."
    isLoading={false}
    metadata={jobDocumentMetadata}
    owner={{ id: jobId, type: 'job' }}
  />
);

type JobScheduleSlot = JobDetail['schedule'][number]['bays'][number]['slots'][number];

/** Timeline tones follow the planning Gantt bars: only the single next-up slot reads green; other
 * future slots stay neutral like done ones. */
const scheduleTimelineTone = {
  active: {
    badge: scheduleBadgeToneClass.active,
    card: scheduleBarToneClass.active,
    dot: scheduleDotToneClass.active,
    label: 'Active',
  },
  done: {
    badge: scheduleBadgeToneClass.done,
    card: '',
    dot: scheduleDotToneClass.neutral,
    label: 'Done',
  },
  next: {
    badge: scheduleBadgeToneClass.scheduled,
    card: scheduleBarToneClass.scheduled,
    dot: scheduleDotToneClass.scheduled,
    label: 'Next up',
  },
  scheduled: {
    badge: scheduleBadgeToneClass.done,
    card: '',
    dot: scheduleDotToneClass.neutral,
    label: 'Scheduled',
  },
} as const;

const JobScheduleTab: React.FC<{ job: JobDetail }> = ({ job }) => {
  const entries = job.schedule
    .flatMap((department) =>
      department.bays.flatMap((bay) =>
        bay.slots.map((slot) => ({ bayName: bay.name, department: department.department, slot })),
      ),
    )
    .sort(
      (a, b) =>
        a.slot.startDate.localeCompare(b.slot.startDate) ||
        a.slot.endDate.localeCompare(b.slot.endDate) ||
        a.slot.sequence - b.slot.sequence,
    );

  if (entries.length === 0) {
    return <div className="text-muted-foreground text-sm">No slots scheduled.</div>;
  }

  const nextSlotId = entries.find((entry) => entry.slot.state === 'scheduled')?.slot.id ?? null;

  return (
    <div className="text-sm">
      {entries.map((entry, index) => (
        <ScheduleTimelineItem
          key={entry.slot.id}
          bayName={entry.bayName}
          department={entry.department}
          isFirst={index === 0}
          isLast={index === entries.length - 1}
          isNext={entry.slot.id === nextSlotId}
          slot={entry.slot}
        />
      ))}
    </div>
  );
};

const ScheduleTimelineItem: React.FC<{
  bayName: string;
  department: JobDetail['schedule'][number]['department'];
  isFirst: boolean;
  isLast: boolean;
  isNext: boolean;
  slot: JobScheduleSlot;
}> = ({ bayName, department, isFirst, isLast, isNext, slot }) => {
  const tone = scheduleTimelineTone[slot.state === 'active' ? 'active' : isNext ? 'next' : slot.state];
  const breakdownNote = [
    slot.dayBreakdown.closureDays > 0 ? `${slot.dayBreakdown.closureDays}d closure` : null,
    slot.dayBreakdown.overtimeDays > 0 ? `${slot.dayBreakdown.overtimeDays}d overtime` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex gap-3">
      <div className="relative flex w-2.5 shrink-0 justify-center">
        {isFirst && isLast ? null : (
          <span
            aria-hidden="true"
            className={cn('absolute w-px bg-border', isFirst ? 'top-3.5 bottom-0' : isLast ? 'top-0 h-5' : 'inset-y-0')}
          />
        )}
        <span aria-hidden="true" className={cn('relative mt-3.5 size-2.5 rounded-full', tone.dot)} />
      </div>
      <div className={cn('min-w-0 flex-1', isLast ? '' : 'pb-3')}>
        <Card className={cn('gap-0 py-0', tone.card)} size="sm">
          <div className="flex min-w-0 items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{departmentLabels[department]}</span>
              <span className="text-muted-foreground"> · {bayName}</span>
            </span>
            <Badge className={cn('shrink-0', tone.badge)} variant="outline">
              {tone.label}
            </Badge>
          </div>
          <CardSeparator />
          <div className="flex min-w-0 items-center gap-3 px-3 py-2">
            <OperatorValue operator={slot.operator} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate tabular-nums">
                {formatDate(slot.startDate, 'short')} to {formatDate(slot.endDate, 'short')}
              </span>
              {breakdownNote ? (
                <span className="truncate text-muted-foreground text-xs tabular-nums">incl. {breakdownNote}</span>
              ) : null}
            </div>
            <span className="shrink-0 tabular-nums">{slot.durationDays}d</span>
          </div>
        </Card>
      </div>
    </div>
  );
};

const OperatorValue: React.FC<{
  operator: JobScheduleSlot['operator'];
}> = ({ operator }) => {
  if (!operator) {
    return <span className="shrink-0 text-muted-foreground">No operator</span>;
  }

  return (
    <span className="inline-flex min-w-0 max-w-40 shrink-0 items-center gap-2">
      <EntityThumbnail
        className="shrink-0"
        label={operator.name}
        size="sm"
        thumbnailDataUrl={operator.thumbnailDataUrl}
      />
      <span className="min-w-0 truncate">{operator.name}</span>
    </span>
  );
};

const Section: React.FC<{
  action?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string | undefined;
  icon: React.ReactNode;
  title: string;
}> = ({ action, children, contentClassName, icon, title }) => (
  <Card>
    <CardHeader className="min-w-0 has-data-[slot=card-action]:grid-cols-[minmax(0,1fr)_auto]">
      <CardTitle className="flex min-w-0 items-center gap-2">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <span className="truncate">{title}</span>
      </CardTitle>
      {action ? <CardAction span="title">{action}</CardAction> : null}
    </CardHeader>
    <CardSeparator />
    <CardContent className={contentClassName}>{children}</CardContent>
  </Card>
);

const JobSheetSkeleton = () => (
  <div className="grid gap-3 p-4">
    <Skeleton className="h-9" />
    <Skeleton className="h-40" />
    <Skeleton className="h-24" />
  </div>
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
