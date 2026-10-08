import { formatDate } from '@pkg/domain';
import { breakdownUrgencyColorClassNames, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import { BreakdownDescription, type BreakdownDetail, breakdownUrgencies } from '@pkg/schema/contracting';
import { IconExternalLink } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { z } from 'zod';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { BreakdownStatusBadge, BreakdownSubjectLabel } from '@/contracting/components/BreakdownSubjectLabel.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { BreakdownNotesCard } from './BreakdownNotesCard.js';
import { BreakdownPhotosCard } from './BreakdownPhotosCard.js';
import { BreakdownWorkshopCard } from './BreakdownWorkshopCard.js';
import { DispatchHintsCard } from './DispatchHintsCard.js';
import { type BreakdownSheet, breakdownSheet, type ReportValues, reportPatchInput } from './types.js';

// A Foreman can add a note or a photo from the field while the workshop has the Breakdown open.
const BREAKDOWN_REFETCH_INTERVAL_MS = 30_000;

export function BreakdownPage({ id }: { id: string }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingBreakdowns.get.queryOptions({ id }, { refetchInterval: BREAKDOWN_REFETCH_INTERVAL_MS }),
  );
  const breakdown = query.data;
  return (
    <PageLayout
      title={
        breakdown ? (
          <BreakdownSubjectLabel
            urgency={breakdown.urgency}
            subject={breakdown.subject}
            name={breakdown.subject.code}
            size={24}
          />
        ) : (
          'Breakdown'
        )
      }
      description={
        breakdown
          ? `${breakdownUrgencyLabels[breakdown.urgency]} · reported ${formatDate(breakdown.reportedAt, 'medium')} by ${breakdown.reporterName}`
          : undefined
      }
      size="md"
      actions={breakdown ? <BreakdownStatusBadge status={breakdown.status} /> : null}
    >
      <QueryContent errorMessage="Unable to load the Breakdown." query={query}>
        {(detail) => {
          const sheet = breakdownSheet(detail);
          return (
            <div className="space-y-5">
              <ReportCard key={`report-${detail.id}`} breakdown={detail} sheet={sheet} />
              <BreakdownPhotosCard breakdown={detail} sheet={sheet} />
              <BreakdownWorkshopCard breakdown={detail} sheet={sheet} />
              <DispatchHintsCard breakdown={detail} />
              <BreakdownNotesCard breakdown={detail} sheet={sheet} />
            </div>
          );
        }}
      </QueryContent>
    </PageLayout>
  );
}

const ReportFormValues = z.object({
  description: BreakdownDescription,
  urgency: z.enum(breakdownUrgencies),
  jobId: z.string(),
});

function ReportCard({ breakdown, sheet }: { breakdown: BreakdownDetail; sheet: BreakdownSheet }) {
  const trpc = useTRPC();
  const { invalidateWorkshop } = useQueryInvalidation();
  const editable = sheet.can('editReport');
  const jobs = useQuery(
    trpc.contractingBreakdowns.options.jobs.queryOptions(
      { kind: breakdown.subject.kind, id: breakdown.subject.id },
      { enabled: editable },
    ),
  );
  const jobOptions = (jobs.data ?? []).map((job) => ({
    value: job.id,
    label: `${job.jobNumber} · ${job.farmName}`,
  }));
  if (breakdown.jobId && breakdown.jobNumber && !jobOptions.some((option) => option.value === breakdown.jobId))
    jobOptions.push({ value: breakdown.jobId, label: `${breakdown.jobNumber} · ${breakdown.farmName ?? ''}` });
  const patch = useMutation(trpc.contractingBreakdowns.patch.mutationOptions({ onSuccess: invalidateWorkshop }));
  const defaultValues: ReportValues = {
    description: breakdown.description,
    urgency: breakdown.urgency,
    jobId: breakdown.jobId ?? '',
  };
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues,
    failureMessage: 'Unable to update the report.',
    validator: ReportFormValues,
    toInput: (values, saved) => reportPatchInput(breakdown.id, saved, values),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <section aria-label="Report" className="space-y-2">
      <h2 className="font-heading text-lg">Report</h2>
      <ErrorMessage error={jobs.error} fallbackMessage="Unable to load Jobs." />
      <AutosaveFormCard autosave={autosave} formProps={formProps} disabled={!editable}>
        <form.AppField name="urgency">
          {(field) => (
            <field.SelectField
              label="Urgency"
              disabled={!editable}
              options={breakdownUrgencies.map((urgency) => ({
                value: urgency,
                label: (
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className={cn('size-2 rounded-full', breakdownUrgencyColorClassNames[urgency].dot)}
                    />
                    {breakdownUrgencyLabels[urgency]}
                  </span>
                ),
              }))}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="jobId">
          {(field) => (
            <field.ComboboxField
              label="Job"
              disabled={!editable}
              placeholder="Search open Jobs..."
              emptyMessage="No open Jobs found."
              options={[{ value: '', label: 'No Job' }, ...jobOptions]}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="description">{(field) => <field.TextareaField label="What is wrong" />}</form.AppField>
      </AutosaveFormCard>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        {breakdown.jobNumber ? (
          <Link className="hover:underline" params={{ code: breakdown.jobNumber }} to="/contracting/jobs/$code">
            Open {breakdown.jobNumber}
          </Link>
        ) : null}
        {breakdown.latitude !== null && breakdown.longitude !== null ? (
          <a
            className="inline-flex items-center gap-1 hover:underline"
            href={`https://www.google.com/maps?q=${breakdown.latitude},${breakdown.longitude}`}
            rel="noreferrer"
            target="_blank"
          >
            Open in Google Maps
            <IconExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        ) : (
          <span>No location was captured.</span>
        )}
      </div>
    </section>
  );
}
