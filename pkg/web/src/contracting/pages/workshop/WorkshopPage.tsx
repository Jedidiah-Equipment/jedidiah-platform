import { formatNumber } from '@pkg/domain';
import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import { type BreakdownListInput, type BreakdownSummary, breakdownStatuses } from '@pkg/schema/contracting';
import { IconAlertTriangle } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { SearchableCombobox } from '@/components/common/SearchableCombobox.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { PageLayout } from '@/components/page-layout/PageLayout.js';
import { Badge } from '@/components/ui/badge.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useCan } from '@/hooks/use-access.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';
import { BreakdownStatusQuickFilters } from './BreakdownStatusQuickFilters.js';
import { listedStatuses, STATUS_COLUMN_ID } from './types.js';
import { useWorkshopWrite } from './use-workshop-write.js';

const useWorkshopTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'reportedAt', desc: true }] },
  persistName: 'contracting-workshop-table',
});

const breakdownSortOptions: SortOptions<BreakdownListInput> = {
  allowedSortIds: ['reportedAt', 'urgency'],
  defaultSort: { id: 'reportedAt', desc: true },
};

const workshopListInputExtras = (columnFilters: ColumnFiltersState) => ({ statuses: listedStatuses(columnFilters) });

const statusFilterOptions = breakdownStatuses.map((status) => ({
  value: status,
  label: breakdownStatusLabels[status],
}));

export function WorkshopPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const write = useWorkshopWrite();
  const canManage = useCan('contracting_breakdown:update').can;
  const readsQueue = useCan('contracting_breakdown:read').can;
  const summary = useQuery(trpc.contractingBreakdowns.queueSummary.queryOptions(undefined, { enabled: readsQueue }));
  const tableController = useServerSideTableController({
    store: useWorkshopTableStore,
    sortOptions: breakdownSortOptions,
    getListInputExtras: workshopListInputExtras,
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
  const assign = useMutation(
    trpc.contractingBreakdowns.assignMechanic.mutationOptions(write.card('Unable to assign the Mechanic.')),
  );
  const columns = useMemo<DataTableColumnDef<BreakdownSummary>[]>(
    () => [
      {
        accessorKey: 'urgency',
        header: 'Urgency',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => {
          const colours = breakdownUrgencyColorClassNames[row.original.urgency];
          return (
            <Badge className={cn(colours.chip, colours.text)} variant="outline">
              {breakdownUrgencyLabels[row.original.urgency]}
            </Badge>
          );
        },
      },
      {
        id: 'subject',
        header: 'Subject',
        cell: ({ row }) => {
          const { subject, firstLine } = row.original;
          return (
            <div className="min-w-40">
              <CategoryLabel
                icon={subject.categoryIcon}
                colour={subject.categoryColour}
                name={
                  <span className="font-mono font-semibold">
                    {subject.code}
                    {subject.kind === 'implement' ? <span className="font-sans font-normal"> (implement)</span> : null}
                  </span>
                }
              />
              <div className="mt-1 max-w-64 truncate text-xs text-muted-foreground" title={firstLine}>
                {firstLine}
              </div>
            </div>
          );
        },
      },
      {
        id: 'job',
        header: 'Job',
        cell: ({ row }) =>
          row.original.jobNumber ? (
            <div className="min-w-32">
              <Link
                className="font-mono font-semibold hover:underline"
                onClick={(event) => event.stopPropagation()}
                params={{ code: row.original.jobNumber }}
                to="/contracting/jobs/$code"
              >
                {row.original.jobNumber}
              </Link>
              <div className="mt-1 text-xs text-muted-foreground">{row.original.farmName}</div>
            </div>
          ) : (
            <span className="text-muted-foreground">No Job</span>
          ),
      },
      {
        accessorKey: 'reportedAt',
        header: 'Reported',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => (
          <div className="min-w-28">
            <DateDisplay date={row.original.reportedAt} format="medium" />
            <div className="mt-1 text-xs text-muted-foreground">{row.original.reporterName}</div>
          </div>
        ),
      },
      {
        id: 'mechanic',
        header: 'Mechanic',
        cell: ({ row }) =>
          canManage && row.original.status !== 'solved' ? (
            // biome-ignore lint/a11y/noStaticElementInteractions: keeps the picker from opening the row
            // biome-ignore lint/a11y/useKeyWithClickEvents: the picker owns its keyboard handling
            <div className="min-w-40" onClick={(event) => event.stopPropagation()}>
              <SearchableCombobox
                inputId={`mechanic-${row.original.id}`}
                options={[
                  { value: '', label: 'No mechanic' },
                  ...(mechanics.data ?? []).map((person) => ({ value: person.id, label: person.name })),
                ]}
                placeholder="Assign mechanic…"
                value={row.original.primaryMechanicUserId ?? ''}
                onValueChange={(mechanicUserId) =>
                  assign.mutate({ id: row.original.id, mechanicUserId: mechanicUserId || null })
                }
              />
            </div>
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
        cell: ({ row }) => {
          const colours = breakdownStatusColorClassNames[row.original.status];
          return (
            <Badge className={cn(colours.chip, colours.text)} variant="outline">
              {breakdownStatusLabels[row.original.status]}
            </Badge>
          );
        },
      },
      {
        id: 'dispatch',
        header: 'Dispatch',
        cell: ({ row }) =>
          row.original.sameJobOpenCount > 0 ? (
            <span
              className="flex items-center gap-1 text-sm font-medium"
              title="Other fleet on the same Job has open Breakdowns — one trip, several fixes"
            >
              <IconAlertTriangle aria-hidden="true" className="size-4 text-amber-600 dark:text-amber-400" />+
              {formatNumber(row.original.sameJobOpenCount)} on this Job
            </span>
          ) : null,
      },
      {
        id: 'notes',
        header: 'Notes',
        cell: ({ row }) => <span className="text-muted-foreground">{formatNumber(row.original.noteCount)}</span>,
      },
    ],
    [canManage, mechanics.data, assign.mutate],
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
      <ErrorMessage error={summary.error ?? mechanics.error} fallbackMessage="Unable to load the Workshop." />
      <BreakdownStatusQuickFilters
        summary={summary.data}
        columnFilters={tableController.columnFilters}
        onColumnFiltersChange={tableController.setColumnFilters}
      />
      <DataTable
        emptyMessage="No Breakdowns found."
        errorMessage={getApiQueryErrorMessage(breakdownsQuery.error, 'Unable to load Breakdowns.')}
        getRowAriaLabel={(breakdown) => `Open the Breakdown on ${breakdown.subject.code}`}
        hideGlobalFilter
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
