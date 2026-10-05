import { requiredTrimmedText } from '@pkg/schema';
import type { JobDetail } from '@pkg/schema/contracting';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { EntityActionsFooter } from '@/components/common/EntityActionsFooter.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { QueryContent } from '@/components/common/QueryContent.js';
import { AutosaveFormCard } from '@/components/form/AutosaveFormCard.js';
import { CreateEntityDialog, useAutosaveForm } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Button } from '@/components/ui/button.js';
import { useAiVerdictRefetchInterval } from '@/contracting/hooks/use-ai-verdict-polling.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { ChargeLinesCard } from './ChargeLinesCard.js';
import { InvoiceCard } from './InvoiceCard.js';
import { JobCardMenu } from './JobCardMenu.js';
import { JobStatusBadge } from './JobStatusBadge.js';
import { MachinesCard } from './MachinesCard.js';
import { PricingCard } from './PricingCard.js';
import { SignOffCard } from './SignOffCard.js';
import { JobCreateValues, type JobSheet, jobSheet, toJobCreateInput } from './types.js';
import { useJobWrite, useResetOnOpen } from './use-job-write.js';

export function JobPage({ code }: { code: string }) {
  const trpc = useTRPC();
  const refetchInterval = useAiVerdictRefetchInterval((job: JobDetail) =>
    job.assignments.flatMap((assignment) => [assignment.arrival, assignment.departure]),
  );
  const query = useQuery(trpc.contractingJobs.jobs.get.queryOptions({ code }, { refetchInterval }));
  const sheet = query.data ? jobSheet(query.data) : null;
  return (
    <PageLayout
      title={query.data?.jobNumber ?? code}
      description={
        query.data ? `${query.data.customerName} · ${query.data.farmName} · ${query.data.workTypeName}` : undefined
      }
      size="lg"
      actions={
        query.data ? (
          <div className="flex items-center gap-2">
            {sheet?.seesMoney ? <JobCardMenu job={query.data} /> : null}
            <JobStatusBadge size="lg" status={query.data.status} />
          </div>
        ) : null
      }
    >
      <ErrorMessage error={query.error} fallbackMessage="Unable to load Job." />
      <QueryContent errorMessage="Unable to load Job." query={query}>
        {(job) =>
          sheet ? (
            <div className="space-y-5">
              {job.cancellationReason ? <p>Cancelled: {job.cancellationReason}</p> : null}
              <SetupCard key={`setup-${job.id}`} job={job} sheet={sheet} />
              <MachinesCard job={job} sheet={sheet} />
              {sheet.showsSignOff ? <SignOffCard job={job} sheet={sheet} /> : null}
              <PricingCard job={job} sheet={sheet} />
              <InvoiceCard job={job} sheet={sheet} />
              {sheet.showsChargeLines ? (
                <ChargeLinesCard
                  job={job}
                  editable={sheet.can('editChargeLines')}
                  addAction={sheet.action('editChargeLines')}
                  amountEditable={sheet.can('priceChargeLines')}
                />
              ) : null}
              <CancelJob job={job} sheet={sheet} />
            </div>
          ) : null
        }
      </QueryContent>
    </PageLayout>
  );
}

function SetupCard({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  // Naming the Foreman is setup that assigns the Job, so it needs both.
  const setsForeman = sheet.can('editSetup') && sheet.can('assignForeman');
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const [customerId, setCustomerId] = useState(job.customerId);
  const customers = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const farms = useQuery(trpc.contractingDirectory.farms.list.queryOptions({ customerId }));
  const workTypes = useQuery(trpc.contractingDirectory.workTypes.options.queryOptions());
  const foremen = useQuery(
    trpc.contractingJobs.options.foremen.queryOptions(undefined, {
      enabled: setsForeman,
    }),
  );
  // Foremen only load for whoever can change the Foreman; everyone else still needs the current one to show.
  const foremanOptions = (foremen.data ?? []).map((row) => ({ value: row.id, label: row.name }));
  if (job.foremanUserId && job.foremanName && !foremanOptions.some((option) => option.value === job.foremanUserId))
    foremanOptions.push({ value: job.foremanUserId, label: job.foremanName });
  const patch = useMutation(trpc.contractingJobs.jobs.patch.mutationOptions({ onSuccess: invalidateJobs }));
  const { autosave, form, formProps } = useAutosaveForm({
    defaultValues: {
      customerId: job.customerId,
      farmId: job.farmId,
      workTypeId: job.workTypeId,
      description: job.description ?? '',
      foremanUserId: job.foremanUserId ?? '',
    },
    failureMessage: 'Unable to update Job setup.',
    validator: JobCreateValues,
    toInput: (values) => ({ id: job.id, ...toJobCreateInput(values) }),
    save: (input) => patch.mutateAsync(input),
  });
  return (
    <section aria-label="Setup">
      <h2 className="mb-2 font-heading text-lg">Setup</h2>
      <AutosaveFormCard autosave={autosave} formProps={formProps} disabled={!sheet.can('editSetup')}>
        <form.AppField name="customerId">
          {(field) => (
            <field.ComboboxField
              label="Customer"
              options={(customers.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              onValueCommit={(id) => {
                setCustomerId(id);
                form.setFieldValue('farmId', '');
                autosave.commit();
              }}
            />
          )}
        </form.AppField>
        <form.AppField name="farmId">
          {(field) => (
            <field.ComboboxField
              label="Farm"
              options={(farms.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="workTypeId">
          {(field) => (
            <field.SelectField
              label="Work type"
              options={(workTypes.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="foremanUserId">
          {(field) => (
            <field.ComboboxField
              label="Foreman"
              disabled={!setsForeman}
              options={foremanOptions}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
        <form.AppField name="description">{(field) => <field.TextareaField label="Description" />}</form.AppField>
      </AutosaveFormCard>
    </section>
  );
}

function CancelJob({ job, sheet }: { job: JobDetail; sheet: JobSheet }) {
  const trpc = useTRPC();
  const write = useJobWrite();
  const [open, setOpen] = useState(false);
  const cancel = useMutation(
    trpc.contractingJobs.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        await write.invalidateJobs();
        toast.success('Job cancelled');
      },
      onError: write.report,
    }),
  );
  useResetOnOpen(cancel, open);
  const cancelAction = sheet.action('cancel');
  if (!cancelAction) return null;
  return (
    <EntityActionsFooter>
      <Button variant="destructive" {...cancelAction} onClick={() => setOpen(true)}>
        Cancel job
      </Button>
      <CreateEntityDialog
        open={open}
        onOpenChange={setOpen}
        title="Cancel job"
        submitLabel="Cancel job"
        defaultValues={{ reason: '' }}
        validator={z.object({ reason: requiredTrimmedText('A reason is required') })}
        onCreate={(values) => cancel.mutateAsync({ id: job.id, reason: values.reason })}
        onCreated={() => setOpen(false)}
      >
        {(form) => (
          <>
            <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>
            <ErrorMessage error={cancel.error} fallbackMessage="Unable to cancel Job." />
          </>
        )}
      </CreateEntityDialog>
    </EntityActionsFooter>
  );
}
