import { formatDate } from '@pkg/domain';
import type { JobCreateInput, JobDetail, JobQueue, JobSummary } from '@pkg/schema/contracting';
import { jobQueues } from '@pkg/schema/contracting';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { AttentionTabTrigger } from '@/components/common/AttentionTabTrigger.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobCreateValues, queueTabLabel, toJobCreateInput } from './types.js';

export function JobsPage({ queue }: { queue: JobQueue }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const canCreate = useCan('contracting_job:create').can;
  const canAssign = useCan('contracting_job:assign').can;
  const counts = useQuery(trpc.contractingJobs.jobs.queueCounts.queryOptions());
  const [pageCountByQueue, setPageCountByQueue] = useState<Partial<Record<JobQueue, number>>>({});
  const pageCount = pageCountByQueue[queue] ?? 1;
  const jobPages = useQueries({
    queries: Array.from({ length: pageCount }, (_, page) =>
      trpc.contractingJobs.jobs.list.queryOptions({ queue, limit: 200, offset: page * 200 }),
    ),
  });
  const jobs = {
    data: jobPages.flatMap((page) => page.data ?? []),
    isPending: jobPages.some((page) => page.isPending),
    error: jobPages.find((page) => page.error)?.error,
  };
  const activeAttention = useQuery(
    trpc.contractingJobs.jobs.list.queryOptions(
      { queue: 'active', limit: 200, offset: 0 },
      { enabled: queue !== 'active' },
    ),
  );
  const foremen = useQuery(trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: canAssign }));
  const assign = useMutation(
    trpc.contractingJobs.jobs.patch.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to assign Foreman.'),
    }),
  );
  const flow = useCreateEntityFlow({
    mutation: trpc.contractingJobs.jobs.create.mutationOptions(),
    errorMessage: 'Unable to create Job.',
    invalidate: invalidateJobs,
    navigateTo: (job) => ({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } }),
  });
  const columns = useMemo<DataTableColumnDef<JobSummary>[]>(
    () => [
      {
        accessorKey: 'jobNumber',
        header: 'Job',
        enableSorting: true,
        cell: ({ row }) => <span className="font-mono font-semibold">{row.original.jobNumber}</span>,
      },
      {
        id: 'customer',
        header: 'Customer · Farm',
        cell: ({ row }) => `${row.original.customerName} · ${row.original.farmName}`,
      },
      { accessorKey: 'workTypeName', header: 'Work type' },
      {
        id: 'foreman',
        header: 'Foreman',
        cell: ({ row }) =>
          queue === 'upcoming' && row.original.foremanUserId === null && canAssign ? (
            <div>
              <SearchableCombobox
                inputId={`foreman-${row.original.id}`}
                options={(foremen.data ?? []).map((person) => ({ value: person.id, label: person.name }))}
                placeholder="Assign foreman…"
                value=""
                onValueChange={(foremanUserId) => assign.mutate({ id: row.original.id, foremanUserId })}
              />
            </div>
          ) : (
            (row.original.foremanName ?? '—')
          ),
      },
      {
        id: 'machines',
        header: 'Machines',
        cell: ({ row }) =>
          `${row.original.plannedStints} planned · ${row.original.onSiteStints} on site · ${row.original.leftStints} left`,
      },
      {
        id: 'attention',
        header: 'Needs a look',
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.openGapFlags > 0 ? (
              <Badge variant="outline">Gap flag ×{row.original.openGapFlags}</Badge>
            ) : null}
            {row.original.needsALook > row.original.openGapFlags ? (
              <Badge variant="outline">Readings ×{row.original.needsALook - row.original.openGapFlags}</Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'dates',
        header: 'Dates',
        cell: ({ row }) =>
          row.original.startDate && row.original.endDate
            ? `${formatDate(row.original.startDate)} – ${formatDate(row.original.endDate)}`
            : '—',
      },
      ...(queue === 'looks-finished'
        ? [
            {
              id: 'review',
              header: '',
              cell: () => (
                <Button size="sm" variant="outline">
                  Review & sign off
                </Button>
              ),
            } as DataTableColumnDef<JobSummary>,
          ]
        : []),
    ],
    [queue, canAssign, foremen.data, assign.mutate],
  );
  return (
    <>
      <PageLayout title="Jobs" size="lg" actions={canCreate ? <Button onClick={flow.open}>New job</Button> : undefined}>
        <ErrorMessage
          error={counts.error ?? jobs.error ?? foremen.error ?? activeAttention.error}
          fallbackMessage="Unable to load Jobs."
        />
        <Tabs
          value={queue}
          onValueChange={(value) => void navigate({ to: '/contracting/jobs', search: { queue: value as JobQueue } })}
        >
          <TabsList className="flex h-auto flex-wrap justify-start">
            {jobQueues.map((item) => {
              const label = queueTabLabel(item, counts.data);
              const attention =
                item === 'looks-finished'
                  ? (counts.data?.['looks-finished'] ?? 0) > 0
                  : item === 'active' &&
                    (queue === 'active' ? jobs.data : (activeAttention.data ?? [])).some((job) => job.needsALook > 0);
              return item === 'looks-finished' || item === 'active' ? (
                <AttentionTabTrigger
                  key={item}
                  value={item}
                  label={label}
                  needsAttention={attention}
                  attentionLabel="Jobs need a look"
                />
              ) : (
                <TabsTrigger key={item} value={item}>
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>
        <ClientDataTable
          columns={columns}
          rows={jobs.data}
          loading={jobs.isPending}
          emptyMessage="No Jobs in this queue."
          searchPlaceholder="Search Jobs…"
          onOpen={(job) => void navigate({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } })}
        />
        {jobPages[pageCount - 1]?.data?.length === 200 ? (
          <div className="mt-3 text-center">
            <Button
              variant="outline"
              disabled={jobs.isPending}
              onClick={() => setPageCountByQueue((counts) => ({ ...counts, [queue]: pageCount + 1 }))}
            >
              Load more Jobs
            </Button>
          </div>
        ) : null}
      </PageLayout>
      <NewJobDialog flow={flow} canAssign={canAssign} />
    </>
  );
}

function NewJobDialog({
  flow,
  canAssign,
}: {
  flow: {
    dialogProps: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      onCreated: (created: JobDetail) => Promise<void> | void;
    };
    create: (input: JobCreateInput) => Promise<JobDetail>;
  };
  canAssign: boolean;
}) {
  const trpc = useTRPC();
  const [customerId, setCustomerId] = useState('');
  const customers = useQuery(trpc.contractingDirectory.customers.list.queryOptions());
  const farms = useQuery(trpc.contractingDirectory.farms.list.queryOptions({ customerId }, { enabled: !!customerId }));
  const workTypes = useQuery(trpc.contractingDirectory.workTypes.options.queryOptions());
  const foremen = useQuery(trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: canAssign }));
  return (
    <CreateEntityDialog
      {...flow.dialogProps}
      title="New job"
      defaultValues={{ customerId: '', farmId: '', workTypeId: '', description: '', foremanUserId: '' }}
      validator={JobCreateValues}
      onCreate={(values) => flow.create(toJobCreateInput(values))}
    >
      {(form) => (
        <>
          <form.AppField name="customerId">
            {(field) => (
              <field.ComboboxField
                label="Customer"
                options={(customers.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
                onValueCommit={(id) => {
                  setCustomerId(id);
                  form.setFieldValue('farmId', '');
                }}
              />
            )}
          </form.AppField>
          <form.AppField name="farmId">
            {(field) => (
              <field.ComboboxField
                label="Farm"
                disabled={!customerId}
                options={(farms.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              />
            )}
          </form.AppField>
          <form.AppField name="workTypeId">
            {(field) => (
              <field.SelectField
                label="Work type"
                options={(workTypes.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              />
            )}
          </form.AppField>
          <form.AppField name="description">{(field) => <field.TextareaField label="Description" />}</form.AppField>
          {canAssign ? (
            <form.AppField name="foremanUserId">
              {(field) => (
                <field.ComboboxField
                  label="Foreman"
                  options={(foremen.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
                />
              )}
            </form.AppField>
          ) : null}
        </>
      )}
    </CreateEntityDialog>
  );
}
