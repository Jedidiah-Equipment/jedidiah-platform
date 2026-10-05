import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import {
  assignmentAttentionLevelColorClassNames,
  countedAssignmentAttentionLevel,
  jobQueueColorClassNames,
  jobQueueLabels,
  jobQueueOf,
  judgeJobAction,
} from '@pkg/domain/contracting';
import type { JobListInput, JobSummary } from '@pkg/schema/contracting';
import { CustomerName, FarmName, JobSortBy, jobQueues, WorkTypeName } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox, type SearchableComboboxCreate } from '@/components/common/SearchableCombobox.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { useCreateEntityFlow } from '@/components/form/hooks/use-create-entity-flow.js';
import { CreateEntityDialog } from '@/components/form/index.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { JobQueueBadge } from './JobStatusBadge.js';
import {
  isOnlyStage,
  isPickedStages,
  listedStages,
  quickFilterStages,
  STAGE_COLUMN_ID,
  stagesCount,
  toggleQuickFilter,
  toggleStages,
} from './job-stage-filter.js';
import { QuickFilterButton } from './QuickFilterButton.js';
import { JobCreateValues, toJobCreateInput } from './types.js';
import { useJobWrite } from './use-job-write.js';

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
  const write = useJobWrite();
  return useCreateEntityFlow({
    mutation: trpc.contractingJobs.jobs.create.mutationOptions(),
    errorMessage: 'Unable to create Job.',
    invalidate: write.invalidateJobs,
    navigateTo: (job) => ({ to: '/contracting/jobs/$code', params: { code: job.jobNumber } }),
  });
}

const useJobsTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'jobNumber', desc: false }] },
  persistName: 'contracting-jobs-table',
});

const jobSortOptions: SortOptions<JobListInput> = {
  allowedSortIds: JobSortBy.options,
  defaultSort: { id: 'jobNumber' },
};

const jobListInputExtras = (columnFilters: ColumnFiltersState) => ({ queues: listedStages(columnFilters) });

const stageFilterOptions = jobQueues.map((queue) => ({ value: queue, label: jobQueueLabels[queue] }));

export function JobsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useJobWrite();
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
  const tableController = useServerSideTableController({
    store: useJobsTableStore,
    sortOptions: jobSortOptions,
    getListInputExtras: jobListInputExtras,
  });
  const jobsQuery = useInfiniteQuery(
    trpc.contractingJobs.jobs.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: jobs, total } = useCombinedCursorQueryPages(jobsQuery.data?.pages);
  const foremen = useQuery(trpc.contractingJobs.options.foremen.queryOptions(undefined, { enabled: canAssign }));
  const assign = useMutation(trpc.contractingJobs.jobs.patch.mutationOptions(write.card('Unable to assign Foreman.')));
  const flow = useNewJobFlow();
  const openJob = useCallback(
    (job: JobSummary, hash?: string) =>
      void navigate({ to: '/contracting/jobs/$code', params: { code: job.jobNumber }, ...(hash ? { hash } : {}) }),
    [navigate],
  );
  const columns = useMemo<DataTableColumnDef<JobSummary>[]>(
    () => [
      {
        accessorKey: 'jobNumber',
        header: 'Job',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-32">
            <span className="font-mono font-semibold">{row.original.jobNumber}</span>
            {row.original.description ? (
              <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={row.original.description}>
                {row.original.description}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        id: STAGE_COLUMN_ID,
        accessorFn: jobQueueOf,
        header: 'Stage',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: stageFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-32' },
        cell: ({ row }) => <JobQueueBadge queue={jobQueueOf(row.original)} />,
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
            {row.original.status === 'upcoming' &&
            row.original.foremanUserId === null &&
            canAssignForeman(row.original) ? (
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
        cell: ({ row }) => {
          const { assignmentAttention } = row.original;
          const level = countedAssignmentAttentionLevel(assignmentAttention);
          const items = assignmentAttention.critical + assignmentAttention.warning;
          return (
            <div className="min-w-36">
              {level ? (
                <Badge
                  className={cn(
                    assignmentAttentionLevelColorClassNames[level].chip,
                    assignmentAttentionLevelColorClassNames[level].text,
                  )}
                  variant="outline"
                >
                  <IconAlertTriangle aria-hidden="true" />
                  {formatNumber(items)} {items === 1 ? 'item' : 'items'} to review
                </Badge>
              ) : (
                <span className="text-muted-foreground">No issues</span>
              )}
            </div>
          );
        },
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
      {
        id: 'next-step',
        header: '',
        cell: ({ row }) => {
          const queue = jobQueueOf(row.original);
          if (queue === 'looks-finished')
            return (
              <Button size="sm" variant="outline" onClick={() => openJob(row.original)}>
                Review & sign off
              </Button>
            );
          return queue === 'awaiting-pricing' && canPrice ? (
            <Button size="sm" variant="outline" onClick={() => openJob(row.original, 'pricing')}>
              Price
            </Button>
          ) : null;
        },
      },
    ],
    [canAssignForeman, canPrice, foremen.data, assign.mutate, openJob],
  );
  const table = useDataTable({
    columns,
    data: jobs,
    enableSortingRemoval: false,
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      sorting: tableController.sorting,
    },
  });
  const quickStages = quickFilterStages(counts.data, tableController.columnFilters);
  return (
    <>
      <PageLayout
        title="Jobs"
        description="Plan work, track Machines, and move Jobs through each stage."
        size="full"
        actions={canCreate ? <Button onClick={flow.open}>New job</Button> : undefined}
      >
        <ErrorMessage
          error={counts.error ?? foremen.error ?? activeAttention.error}
          fallbackMessage="Unable to load Jobs."
        />
        <fieldset className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Job stages">
          {quickStages.map((item) => (
            <QuickFilterButton
              key={item}
              count={counts.data?.[item] ?? 0}
              pressed={isOnlyStage(tableController.columnFilters, item)}
              onClick={() => tableController.setColumnFilters((current) => toggleQuickFilter(current, item))}
              attention={
                item === 'active' && activeAttention.data ? (
                  <IconAlertTriangle
                    aria-label="Jobs need a look"
                    className={cn('size-3.5', assignmentAttentionLevelColorClassNames[activeAttention.data].icon)}
                  />
                ) : null
              }
            >
              <span aria-hidden="true" className={cn('size-2 rounded-full', jobQueueColorClassNames[item].dot)} />
              <span>{jobQueueLabels[item]}</span>
            </QuickFilterButton>
          ))}
          <QuickFilterButton
            count={stagesCount(counts.data)}
            pressed={isPickedStages(tableController.columnFilters, jobQueues)}
            onClick={() => tableController.setColumnFilters((current) => toggleStages(current, jobQueues))}
          >
            <span>All</span>
          </QuickFilterButton>
        </fieldset>
        <DataTable
          emptyMessage="No Jobs found."
          errorMessage={getApiQueryErrorMessage(jobsQuery.error, 'Unable to load Jobs.')}
          getRowAriaLabel={(job) => `Open ${job.jobNumber}`}
          globalFilterPlaceholder="Search Jobs…"
          isLoading={jobsQuery.isPending}
          paginationMode="cursor"
          loadMore={{
            hasNextPage: jobsQuery.hasNextPage,
            isFetchingNextPage: jobsQuery.isFetchingNextPage,
            loadedCount: jobs.length,
            onLoadMore: () => void jobsQuery.fetchNextPage(),
          }}
          onRowClick={(job) => openJob(job)}
          table={table}
          total={total}
          totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Job' : 'Jobs'}`}
        />
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
