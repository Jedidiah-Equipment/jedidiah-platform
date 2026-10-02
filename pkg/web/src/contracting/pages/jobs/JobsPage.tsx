import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import {
  jobAttentionColorClassNames,
  jobAttentionIconColorClassName,
  jobQueueColorClassNames,
  jobQueueLabels,
  judgeJobAction,
} from '@pkg/domain/contracting';
import type { JobQueue, JobSummary } from '@pkg/schema/contracting';
import { CustomerName, FarmName, jobQueues, WorkTypeName } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox, type SearchableComboboxCreate } from '@/components/common/SearchableCombobox.js';
import { ClientDataTable } from '@/components/data-table/ClientDataTable.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { JobStatusBadge } from './JobStatusBadge.js';
import { JobCreateValues, toJobCreateInput } from './types.js';
import { JobQueueLoadMore, useJobQueuePages } from './use-job-queue-pages.js';

function machineSummary(job: JobSummary) {
  const parts = [
    job.plannedStints ? `${formatNumber(job.plannedStints)} planned` : null,
    job.onSiteStints ? `${formatNumber(job.onSiteStints)} on site` : null,
    job.leftStints ? `${formatNumber(job.leftStints)} left` : null,
  ];
  return parts.filter(Boolean).join(' · ') || `${formatNumber(0)} machines`;
}

function useNewJobFlow() {
  const trpc = useTRPC();
  const { invalidateJobs } = useQueryInvalidation();
  return useCreateEntityFlow({
    mutation: trpc.contractingJobs.jobs.create.mutationOptions(),
    errorMessage: 'Unable to create Job.',
    invalidate: invalidateJobs,
    navigateTo: (job) => ({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } }),
  });
}

export function JobsPage({ queue }: { queue: JobQueue }) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const { invalidateJobs } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const canCreate = useCan('contracting_job:create').can;
  const canAssign = useCan('contracting_job:assign').can;
  const canPrice = useCan('contracting_job:price').can;
  const access = useAccess().data;
  const canAssignForeman = useCallback(
    (job: JobSummary) => !!access && judgeJobAction('assignForeman', job, access).allowed,
    [access],
  );
  const counts = useQuery(trpc.contractingJobs.jobs.queueCounts.queryOptions());
  const activeAttention = useQuery(trpc.contractingJobs.jobs.activeAttention.queryOptions());
  const jobs = useJobQueuePages({ queue }, counts.data?.[queue]);
  const foremen = useQuery(trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: canAssign }));
  const assign = useMutation(
    trpc.contractingJobs.jobs.patch.mutationOptions({
      onSuccess: invalidateJobs,
      onError: (error) => showError(error, 'Unable to assign Foreman.'),
    }),
  );
  const flow = useNewJobFlow();
  const columns = useMemo<DataTableColumnDef<JobSummary>[]>(
    () => [
      {
        accessorKey: 'jobNumber',
        header: 'Job',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-44">
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold">{row.original.jobNumber}</span>
              <JobStatusBadge status={row.original.status} />
            </div>
            {row.original.description ? (
              <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={row.original.description}>
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: 'customer',
        header: 'Customer · Farm',
        cell: ({ row }) => (
          <div className="min-w-36">
            <div className="font-medium">{row.original.customerName}</div>
            <div className="mt-1 text-xs text-muted-foreground">{row.original.farmName}</div>
          </div>
        ),
      },
      {
        id: 'work-and-foreman',
        header: 'Work · Foreman',
        cell: ({ row }) => (
          <div className="min-w-36">
            <div className="font-medium">{row.original.workTypeName}</div>
            {queue === 'upcoming' && row.original.foremanUserId === null && canAssignForeman(row.original) ? (
              <SearchableCombobox
                inputId={`foreman-${row.original.id}`}
                options={(foremen.data ?? []).map((person) => ({ value: person.id, label: person.name }))}
                placeholder="Assign foreman…"
                value=""
                onValueChange={(foremanUserId) => assign.mutate({ id: row.original.id, foremanUserId })}
              />
            ) : (
              <div className="mt-1 text-xs text-muted-foreground">
                {row.original.foremanName ?? 'Foreman unassigned'}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'machines',
        header: 'Machines',
        cell: ({ row }) => (
          <div className="min-w-32">
            <div className="font-medium">{machineSummary(row.original)}</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.original.onSiteStints
                ? `${formatNumber(row.original.onSiteStints)} currently on site`
                : 'No machine on site'}
            </div>
          </div>
        ),
      },
      {
        id: 'attention',
        header: 'Needs a look',
        cell: ({ row }) => (
          <div className="min-w-36">
            {row.original.needsALook > 0 ? (
              <Badge
                className={cn(jobAttentionColorClassNames.chip, jobAttentionColorClassNames.text)}
                variant="outline"
              >
                <IconAlertTriangle aria-hidden="true" />
                {formatNumber(row.original.needsALook)} {row.original.needsALook === 1 ? 'item' : 'items'} to review
              </Badge>
            ) : (
              <span className="text-muted-foreground">No issues</span>
            )}
          </div>
        ),
      },
      {
        id: 'dates',
        header: 'Dates / value',
        cell: ({ row }) => (
          <div className="min-w-32">
            <div className="font-medium">
              {row.original.startDate && row.original.endDate
                ? `${formatDate(row.original.startDate, 'short')} – ${formatDate(row.original.endDate, 'short')}`
                : 'Dates not set'}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {row.original.invoiceNumber ??
                (row.original.pricedTotal !== null ? (
                  formatCurrency(row.original.pricedTotal)
                ) : (
                  <>
                    Updated <DateDisplay date={row.original.updatedAt} />
                  </>
                ))}
            </div>
          </div>
        ),
      },
      ...(queue === 'looks-finished'
        ? [
            {
              id: 'review',
              header: '',
              cell: ({ row }) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigate({ to: '/contracting/jobs/$code', params: { code: row.original.jobNumber } })
                  }
                >
                  Review & sign off
                </Button>
              ),
            } satisfies DataTableColumnDef<JobSummary>,
          ]
        : []),
      ...(queue === 'awaiting-pricing' && canPrice
        ? [
            {
              id: 'price',
              header: '',
              cell: ({ row }) => (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigate({
                      to: '/contracting/jobs/$code',
                      params: { code: row.original.jobNumber },
                      hash: 'pricing',
                    })
                  }
                >
                  Price
                </Button>
              ),
            } satisfies DataTableColumnDef<JobSummary>,
          ]
        : []),
    ],
    [queue, canAssignForeman, canPrice, foremen.data, assign.mutate, navigate],
  );
  return (
    <>
      <PageLayout
        title="Jobs"
        description="Plan work, track Machines, and move Jobs through each stage."
        size="full"
        actions={canCreate ? <Button onClick={flow.open}>New job</Button> : undefined}
      >
        <ErrorMessage
          error={counts.error ?? jobs.error ?? foremen.error ?? activeAttention.error}
          fallbackMessage="Unable to load Jobs."
        />
        <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Job queues">
          {jobQueues.map((item) => (
            <Button
              key={item}
              aria-pressed={queue === item}
              className={cn(
                'h-9 gap-1.5 px-2',
                queue === item && 'border-muted-foreground/60 bg-muted text-foreground',
              )}
              onClick={() => void navigate({ to: '/contracting/jobs', search: { queue: item } })}
              size="sm"
              type="button"
              variant="outline"
            >
              <span aria-hidden="true" className={cn('size-2 rounded-full', jobQueueColorClassNames[item].dot)} />
              <span>{jobQueueLabels[item]}</span>
              <span className="rounded bg-muted px-1 text-xs text-muted-foreground">
                {formatNumber(counts.data?.[item] ?? 0)}
              </span>
              {item === 'active' && activeAttention.data ? (
                <IconAlertTriangle
                  aria-label="Jobs need a look"
                  className={cn('size-3.5', jobAttentionIconColorClassName)}
                />
              ) : null}
            </Button>
          ))}
        </fieldset>
        <ClientDataTable
          columns={columns}
          rows={jobs.rows}
          loading={jobs.isPending}
          emptyMessage="No Jobs in this queue."
          searchPlaceholder="Search Jobs…"
          onOpen={(job) => void navigate({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } })}
        />
        <JobQueueLoadMore pages={jobs} />
      </PageLayout>
      <NewJobDialog flow={flow} canAssign={canAssign} />
    </>
  );
}

function NewJobDialog({ flow, canAssign }: { flow: ReturnType<typeof useNewJobFlow>; canAssign: boolean }) {
  const trpc = useTRPC();
  const { invalidateDirectory } = useQueryInvalidation();
  const showError = useApiMutationErrorToast();
  const canUpdateDirectory = useCan('contracting_directory:update').can;
  const createCustomer = useMutation(
    trpc.contractingDirectory.customers.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create Customer.'),
    }),
  );
  const createFarm = useMutation(
    trpc.contractingDirectory.farms.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create Farm.'),
    }),
  );
  const createWorkType = useMutation(
    trpc.contractingDirectory.workTypes.create.mutationOptions({
      onError: (error) => showError(error, 'Unable to create Work type.'),
    }),
  );
  // The new option has to be in the list before the field points at it, or the input shows blank.
  const directoryCreate = (
    nameSchema: { safeParse: (value: string) => { data?: string | undefined } },
    create: (name: string) => Promise<{ id: string }>,
  ): SearchableComboboxCreate | undefined =>
    canUpdateDirectory
      ? {
          onCreate: async (name) => {
            const created = await create(name).catch(() => undefined);
            if (!created) return undefined;

            await invalidateDirectory();
            return created.id;
          },
          toName: (inputValue) => nameSchema.safeParse(inputValue).data,
        }
      : undefined;
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
                placeholder={canUpdateDirectory ? 'Search or type a new Customer...' : 'Search...'}
                create={directoryCreate(CustomerName, (name) => createCustomer.mutateAsync({ name }))}
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
                placeholder={canUpdateDirectory ? 'Search or type a new Farm...' : 'Search...'}
                create={directoryCreate(FarmName, (name) => createFarm.mutateAsync({ customerId, name }))}
                options={(farms.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              />
            )}
          </form.AppField>
          <form.AppField name="workTypeId">
            {(field) => (
              <field.ComboboxField
                label="Work type"
                placeholder={canUpdateDirectory ? 'Search or type a new Work type...' : 'Search...'}
                create={directoryCreate(WorkTypeName, (name) => createWorkType.mutateAsync({ name }))}
                options={(workTypes.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              />
            )}
          </form.AppField>
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
          <form.AppField name="description">{(field) => <field.TextareaField label="Description" />}</form.AppField>
        </>
      )}
    </CreateEntityDialog>
  );
}
