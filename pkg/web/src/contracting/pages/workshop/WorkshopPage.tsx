import { formatNumber } from '@pkg/domain';
import { breakdownStatusLabels, breakdownUrgencyLabels } from '@pkg/domain/contracting';
import {
  type BreakdownListInput,
  type BreakdownSummary,
  breakdownStatuses,
  breakdownUrgencies,
} from '@pkg/schema/contracting';
import { IconAlertTriangle, IconFlag } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { MechanicCombobox } from '@/contracting/components/MechanicCombobox.js';
import { useContractingWrite } from '@/contracting/hooks/use-contracting-write.js';
import { useQueryInvalidation } from '@/contracting/hooks/use-query-invalidation.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { BreakdownStatusQuickFilters } from './BreakdownStatusQuickFilters.js';
import {
  FARM_COLUMN_ID,
  JOB_COLUMN_ID,
  MECHANIC_COLUMN_ID,
  REPORTED_COLUMN_ID,
  REPORTER_COLUMN_ID,
  STATUS_COLUMN_ID,
  SUBJECT_COLUMN_ID,
  subjectFilterValue,
  URGENCY_COLUMN_ID,
  workshopListFilters,
} from './types.js';

const useWorkshopTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'reportedAt', desc: true }] },
  persistName: 'contracting-workshop-table',
});

const breakdownSortOptions: SortOptions<BreakdownListInput> = {
  allowedSortIds: ['reportedAt', 'urgency'],
  defaultSort: { id: 'reportedAt', desc: true },
};

const urgencyFilterOptions = breakdownUrgencies.map((urgency) => ({
  value: urgency,
  label: breakdownUrgencyLabels[urgency],
}));

const statusFilterOptions = breakdownStatuses.map((status) => ({
  value: status,
  label: breakdownStatusLabels[status],
}));

export function WorkshopPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useContractingWrite(useQueryInvalidation().invalidateWorkshop);
  const canManage = useCan('contracting_breakdown:update').can;
  const summary = useQuery(trpc.contractingBreakdowns.queueSummary.queryOptions());
  const tableController = useServerSideTableController({
    store: useWorkshopTableStore,
    sortOptions: breakdownSortOptions,
    getListInputExtras: workshopListFilters,
  });
  const breakdownsQuery = useInfiniteQuery(
    trpc.contractingBreakdowns.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items: breakdowns, total } = useCombinedCursorQueryPages(breakdownsQuery.data?.pages);
  const mechanics = useQuery(
    trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: canManage }),
  );
  const filters = useQuery(trpc.contractingBreakdowns.options.filters.queryOptions());
  const filterOptions = useMemo(() => {
    const data = filters.data;
    return {
      subjects: (data?.subjects ?? []).map((subject) => ({
        value: subjectFilterValue(subject),
        label: subject.kind === 'implement' ? `${subject.code} (implement)` : subject.code,
      })),
      jobs: (data?.jobs ?? []).map((job) => ({ value: job.id, label: job.jobNumber })),
      farms: (data?.farms ?? []).map((farm) => ({ value: farm.id, label: farm.name })),
      reporters: (data?.reporters ?? []).map((person) => ({ value: person.id, label: person.name })),
    };
  }, [filters.data]);
  const mechanicOptions = useMemo(
    () => (mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name })),
    [mechanics.data],
  );
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions(write.card('Unable to assign the Mechanic.')),
  );
  const columns = useMemo<DataTableColumnDef<BreakdownSummary>[]>(
    () => [
      {
        id: REPORTED_COLUMN_ID,
        accessorKey: 'reportedAt',
        header: 'Reported',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterVariant: 'date-range', headerClassName: 'min-w-36' },
        cell: ({ row }) => <DateDisplay date={row.original.reportedAt} format="medium" />,
      },
      {
        id: URGENCY_COLUMN_ID,
        accessorKey: 'urgency',
        header: () => <IconFlag aria-label="Urgency" className="size-4" role="img" />,
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterOptions: urgencyFilterOptions, filterVariant: 'multi-select', headerClassName: 'w-0' },
        cell: ({ row }) => <BreakdownUrgencyIcon urgency={row.original.urgency} />,
      },
      {
        id: SUBJECT_COLUMN_ID,
        accessorFn: (breakdown) => subjectFilterValue(breakdown.subject),
        header: 'Subject',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.subjects, filterVariant: 'multi-select' },
        cell: ({ row }) => {
          const { subject } = row.original;
          return (
            <CategoryLabel
              className="min-w-36"
              icon={subject.categoryIcon}
              colour={subject.categoryColour}
              name={
                <span className="font-mono font-semibold">
                  {subject.code}
                  {subject.kind === 'implement' ? <span className="font-sans font-normal"> (implement)</span> : null}
                </span>
              }
            />
          );
        },
      },
      {
        id: 'problem',
        accessorKey: 'firstLine',
        header: 'Problem',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="max-w-64 min-w-40 truncate text-muted-foreground" title={row.original.firstLine}>
            {row.original.firstLine}
          </div>
        ),
      },
      {
        id: JOB_COLUMN_ID,
        accessorKey: 'jobId',
        header: 'Job',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.jobs, filterVariant: 'multi-select' },
        cell: ({ row }) =>
          row.original.jobNumber ? (
            <Link
              className="font-mono font-semibold whitespace-nowrap hover:underline"
              onClick={(event) => event.stopPropagation()}
              params={{ code: row.original.jobNumber }}
              to="/contracting/jobs/$code"
            >
              {row.original.jobNumber}
            </Link>
          ) : (
            <span className="text-muted-foreground">No Job</span>
          ),
      },
      {
        id: FARM_COLUMN_ID,
        accessorKey: 'farmId',
        header: 'Farm',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.farms, filterVariant: 'multi-select' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.farmName ?? ''}</span>,
      },
      {
        id: REPORTER_COLUMN_ID,
        accessorKey: 'reportedByUserId',
        header: 'Reporter',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: filterOptions.reporters, filterVariant: 'multi-select' },
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.reporterName}</span>,
      },
      {
        id: MECHANIC_COLUMN_ID,
        accessorKey: 'primaryMechanicUserId',
        header: 'Mechanic',
        enableColumnFilter: canManage,
        enableSorting: false,
        meta: { filterOptions: mechanicOptions, filterVariant: 'multi-select' },
        cell: ({ row }) =>
          canManage && row.original.status !== 'solved' ? (
            <MechanicCombobox
              inRow
              inputId={`mechanic-${row.original.id}`}
              options={mechanicOptions}
              value={row.original.primaryMechanicUserId}
              onValueChange={(mechanicUserId) => assign.mutate({ id: row.original.id, mechanicUserId })}
            />
          ) : (
            <span className={row.original.mechanicName ? undefined : 'text-muted-foreground'}>
              {row.original.mechanicName ?? 'Unassigned'}
            </span>
          ),
      },
      {
        id: STATUS_COLUMN_ID,
        accessorKey: 'status',
        header: 'Status',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: statusFilterOptions, filterVariant: 'multi-select', headerClassName: 'min-w-28' },
        cell: ({ row }) => <BreakdownStatusBadge status={row.original.status} />,
      },
      {
        id: 'dispatch',
        header: 'Dispatch',
        cell: ({ row }) =>
          row.original.sameJobOpenCount > 0 ? (
            <span
              className="flex items-center gap-1 text-sm font-medium"
              title="Other fleet on the same Job has Breakdowns not yet Fixed — one trip, several fixes"
            >
              <IconAlertTriangle aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />+
              {formatNumber(row.original.sameJobOpenCount)} on this Job
            </span>
          ) : null,
      },
      {
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => {
          const { noteCount, soleNote } = row.original;
          if (noteCount === 0) return null;
          if (soleNote !== null)
            return (
              <div className="max-w-64 truncate text-sm text-muted-foreground" title={soleNote}>
                {soleNote}
              </div>
            );
          return <span className="text-muted-foreground">{`${formatNumber(noteCount)} notes`}</span>;
        },
      },
    ],
    [canManage, filterOptions, mechanicOptions, assign.mutate],
  );
  const table = useDataTable({
    columns,
    data: breakdowns,
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
  return (
    <PageLayout
      title="Workshop"
      description="Breakdowns reported from the field, newest first. One trip can fix several."
      size="full"
    >
      <ErrorMessage
        error={summary.error ?? filters.error ?? mechanics.error}
        fallbackMessage="Unable to load the Workshop."
      />
      <BreakdownStatusQuickFilters
        summary={summary.data}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage="No Breakdowns found."
        errorMessage={getApiQueryErrorMessage(breakdownsQuery.error, 'Unable to load Breakdowns.')}
        getRowAriaLabel={(breakdown) => `Open the Breakdown on ${breakdown.subject.code}`}
        globalFilterPlaceholder="Search Breakdowns…"
        isLoading={breakdownsQuery.isPending}
        paginationMode="cursor"
        loadMore={{
          hasNextPage: breakdownsQuery.hasNextPage,
          isFetchingNextPage: breakdownsQuery.isFetchingNextPage,
          loadedCount: breakdowns.length,
          onLoadMore: () => void breakdownsQuery.fetchNextPage(),
        }}
        onRowClick={(breakdown) => void navigate({ to: '/contracting/workshop/$id', params: { id: breakdown.id } })}
        table={table}
        total={total}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Breakdown' : 'Breakdowns'}`}
      />
    </PageLayout>
  );
}
