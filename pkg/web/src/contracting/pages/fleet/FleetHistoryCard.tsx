import { formatDate, type StatusBadgeColor } from '@pkg/domain';
import { fleetHistoryKindLabels } from '@pkg/domain/contracting';
import {
  type BreakdownSubjectRef,
  type FleetHistoryListInput,
  type FleetHistoryRow,
  fleetHistoryKinds,
  type ReadingRole,
} from '@pkg/schema/contracting';
import { IconGauge, IconTool, type TablerIcon } from '@tabler/icons-react';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { ActivityEventTile } from '@/components/activity/ActivityEntries.js';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { ErrorMessage } from '@/components/common/ErrorMessage.js';
import { readDateOnlyRangeFilter, readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { Badge } from '@/components/ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { ACTIVITY_EVENT_ICONS } from '@/contracting/components/activity/ActivityEntry.js';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectLabel.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

const WHEN_COLUMN_ID = 'at';
const KIND_COLUMN_ID = 'kind';

const historySortOptions: SortOptions<FleetHistoryListInput> = {
  allowedSortIds: [WHEN_COLUMN_ID, KIND_COLUMN_ID],
  defaultSort: { id: WHEN_COLUMN_ID, desc: true },
};

/** Everything the History's column filters ask of the list. */
export function historyListFilters(columnFilters: ColumnFiltersState) {
  const picked = readMultiSelectFilter(columnFilters, KIND_COLUMN_ID);
  return {
    kinds: fleetHistoryKinds.filter((kind) => picked.includes(kind)),
    ...readDateOnlyRangeFilter(columnFilters, WHEN_COLUMN_ID, ['from', 'to']),
  } satisfies Partial<FleetHistoryListInput>;
}

const readingTiles: Partial<Record<ReadingRole, { icon: TablerIcon; tone: StatusBadgeColor }>> = {
  arrival: { icon: ACTIVITY_EVENT_ICONS['machine-arrived'], tone: 'blue' },
  departure: { icon: ACTIVITY_EVENT_ICONS['machine-left'], tone: 'gray' },
};
const otherReadingTile = { icon: IconGauge, tone: 'gray' } as const;
const serviceTile = { icon: IconTool, tone: 'green' } as const;

function HistoryWhatHappened({ row }: { row: FleetHistoryRow }) {
  const icon = row.breakdown ? (
    <BreakdownUrgencyIcon urgency={row.breakdown.urgency} size={20} />
  ) : row.kind === 'service' ? (
    <ActivityEventTile {...serviceTile} />
  ) : (
    <ActivityEventTile {...((row.readingRole && readingTiles[row.readingRole]) ?? otherReadingTile)} />
  );
  return (
    <div className="flex min-w-48 items-center gap-3">
      {icon}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{row.title}</span>
          {row.breakdown ? <BreakdownStatusBadge status={row.breakdown.status} /> : null}
          {row.evidence ? <Badge variant="outline">{row.evidence}</Badge> : null}
        </div>
        {row.detail ? <div className="mt-1 text-xs text-muted-foreground">{row.detail}</div> : null}
      </div>
    </div>
  );
}

/**
 * One newest-first timeline of what happened to a Machine or Implement: readings, Breakdowns and services, paged,
 * sorted and filtered on the server. It opens unfiltered every time.
 */
export function FleetHistoryCard({
  subject: { kind: subjectKind, id: subjectId },
  onOpenService,
}: {
  subject: BreakdownSubjectRef;
  /** A service row has no page of its own, so it opens the Machine's Service tab. */
  onOpenService?: () => void;
}) {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const subject = useMemo(() => ({ kind: subjectKind, id: subjectId }), [subjectKind, subjectId]);
  const [useHistoryTableStore] = useState(() =>
    createDataTableStore({ sorting: [{ id: WHEN_COLUMN_ID, desc: true }] }),
  );
  const getListInputExtras = useCallback(
    (columnFilters: ColumnFiltersState) => ({ subject, ...historyListFilters(columnFilters) }),
    [subject],
  );
  const tableController = useServerSideTableController({
    store: useHistoryTableStore,
    sortOptions: historySortOptions,
    getListInputExtras,
  });
  const historyQuery = useInfiniteQuery(
    trpc.contractingFleet.history.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const filters = useQuery(trpc.contractingFleet.history.filters.queryOptions({ subject }));
  const { items, total } = useCombinedCursorQueryPages(historyQuery.data?.pages);
  const kinds = filters.data?.kinds;
  const columns = useMemo<DataTableColumnDef<FleetHistoryRow>[]>(
    () => [
      {
        id: WHEN_COLUMN_ID,
        accessorKey: 'at',
        header: 'When',
        enableColumnFilter: true,
        enableSorting: true,
        meta: { filterVariant: 'date-range' },
        // A service carries a plant date, not an instant, so it shows no time of day.
        cell: ({ row }) =>
          row.original.kind === 'service' ? (
            formatDate(row.original.at, 'short')
          ) : (
            <DateDisplay date={row.original.at} />
          ),
      },
      {
        id: KIND_COLUMN_ID,
        accessorFn: (row) => fleetHistoryKindLabels[row.kind],
        header: 'Kind',
        enableColumnFilter: (kinds?.length ?? 0) > 1,
        enableSorting: true,
        meta: {
          filterVariant: 'multi-select',
          filterOptions: (kinds ?? []).map((kind) => ({ label: fleetHistoryKindLabels[kind], value: kind })),
        },
      },
      {
        id: 'whatHappened',
        header: 'What happened',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => <HistoryWhatHappened row={row.original} />,
      },
    ],
    [kinds],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableSortingRemoval: false,
    getRowId: (row) => `${row.kind}-${row.id}`,
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
  // Without any kind to read, such as an Implement for someone who cannot read Breakdowns, there is no History.
  if (kinds?.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
      </CardHeader>
      <CardContent>
        <ErrorMessage error={filters.error} fallbackMessage="Unable to load the History filters." />
        <DataTable
          table={table}
          total={total}
          emptyMessage="Nothing has happened to it yet."
          errorMessage={getApiQueryErrorMessage(historyQuery.error, 'Unable to load history.')}
          globalFilterPlaceholder="Search history…"
          isLoading={historyQuery.isPending}
          paginationMode="cursor"
          loadMore={{
            hasNextPage: historyQuery.hasNextPage,
            isFetchingNextPage: historyQuery.isFetchingNextPage,
            loadedCount: items.length,
            onLoadMore: () => void historyQuery.fetchNextPage(),
          }}
          canOpenRow={({ opens }) => opens !== null && (opens.to !== 'service' || onOpenService !== undefined)}
          onRowClick={({ opens }) => {
            if (opens?.to === 'breakdown') void navigate({ to: '/contracting/workshop/$id', params: { id: opens.id } });
            else if (opens?.to === 'job')
              void navigate({ to: '/contracting/jobs/$code', params: { code: opens.jobNumber } });
            else if (opens?.to === 'service') onOpenService?.();
          }}
        />
      </CardContent>
    </Card>
  );
}
