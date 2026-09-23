import { hasPermission } from '@pkg/domain';
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
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useAccess } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { ChargeLinesCard } from './ChargeLinesCard.js';
import { InvoiceCard } from './InvoiceCard.js';
import { JobCardMenu } from './JobCardMenu.js';
import { MachinesCard } from './MachinesCard.js';
import { PricingCard } from './PricingCard.js';
import { SignOffCard } from './SignOffCard.js';
import { JobCreateValues, jobCapabilities, toJobCreateInput } from './types.js';

export function JobPage({ code }: { code: string }) {
  const trpc = useTRPC();
  const query = useQuery(trpc.contractingJobs.jobs.get.queryOptions({ code }));
  const access = useAccess();
  const capabilities = query.data
    ? jobCapabilities(query.data, (permission) => hasPermission(access.data, permission))
    : null;
  return (
    <PageLayout
      title={query.data?.jobNumber ?? code}
      description={
        query.data ? `${query.data.customerName} · ${query.data.farmName} · ${query.data.workTypeName}` : undefined
      }
      size="lg"
      actions={query.data && capabilities?.jobCard ? <JobCardMenu job={query.data} /> : null}
    >
      <ErrorMessage error={query.error} fallbackMessage="Unable to load Job." />
      <QueryContent errorMessage="Unable to load Job." query={query}>
        {(job) =>
          capabilities ? (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <Badge variant="secondary">
                  {job.status[0]?.toUpperCase()}
                  {job.status.slice(1)}
                </Badge>
                <span>{job.foremanName ?? 'No Foreman assigned'}</span>
                {job.cancellationReason ? <span>Cancelled: {job.cancellationReason}</span> : null}
              </div>
              <SetupCard key={`setup-${job.id}`} job={job} capabilities={capabilities} />
              <MachinesCard job={job} capabilities={capabilities} />
              {capabilities.signOff ? <SignOffCard job={job} capabilities={capabilities} /> : null}
              <PricingCard job={job} capabilities={capabilities} />
              <InvoiceCard job={job} capabilities={capabilities} />
              {job.status !== 'upcoming' ? (
                <ChargeLinesCard
                  job={job}
                  editable={capabilities.editChargeLines}
                  amountEditable={capabilities.price}
                />
              ) : null}
              <CancelJob job={job} enabled={capabilities.cancel} />
            </div>
          ) : null
        }
      </QueryContent>
    </PageLayout>
  );
}

type Capabilities = ReturnType<typeof jobCapabilities>;

function SetupCard({ job, capabilities }: { job: JobDetail; capabilities: Capabilities }) {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  const [customerId, setCustomerId] = useState(job.customerId);
  const customers = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const farms = useQuery(trpc.contractingDirectory.farms.list.queryOptions({ customerId }));
  const workTypes = useQuery(trpc.contractingDirectory.workTypes.options.queryOptions());
  const foremen = useQuery(
    trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: capabilities.assign }),
  );
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
      <AutosaveFormCard autosave={autosave} formProps={formProps} disabled={!capabilities.editSetup}>
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
        <form.AppField name="description">{(field) => <field.TextareaField label="Description" />}</form.AppField>
        <form.AppField name="foremanUserId">
          {(field) => (
            <field.ComboboxField
              label="Foreman"
              disabled={!capabilities.assign}
              options={(foremen.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              onValueCommit={autosave.commit}
            />
          )}
        </form.AppField>
      </AutosaveFormCard>
    </section>
  );
}

function CancelJob({ job, enabled }: { job: JobDetail; enabled: boolean }) {
  const trpc = useTRPC();
  const showError = useApiMutationErrorToast();
  const { invalidateJobs } = useQueryInvalidation();
  const [open, setOpen] = useState(false);
  const cancel = useMutation(
    trpc.contractingJobs.jobs.cancel.mutationOptions({
      onSuccess: async () => {
        await invalidateJobs();
        toast.success('Job cancelled');
      },
      onError: (error) => showError(error, 'Unable to cancel Job.'),
    }),
  );
  if (!enabled) return null;
  return (
    <EntityActionsFooter>
      <Button variant="destructive" onClick={() => setOpen(true)}>
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
        {(form) => <form.AppField name="reason">{(field) => <field.TextareaField label="Reason" />}</form.AppField>}
      </CreateEntityDialog>
    </EntityActionsFooter>
  );
}
