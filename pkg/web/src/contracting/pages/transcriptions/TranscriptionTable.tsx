import { formatNumber } from '@pkg/domain';
import type { TranscriptionHintStatus, TranscriptionListInput, TranscriptionReviewItem } from '@pkg/schema/contracting';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { useMemo } from 'react';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';
import { TranscriptionTexts } from './TranscriptionTexts.js';

const useTranscriptionTableStore = createPersistedDataTableStore({
  initialState: { sorting: [{ id: 'createdAt', desc: true }] },
  persistName: 'contracting-transcriptions-table',
});

const transcriptionSortOptions: SortOptions<TranscriptionListInput> = {
  allowedSortIds: ['createdAt'],
  defaultSort: { id: 'createdAt', desc: true },
};

const transcriptionListInputExtras = (columnFilters: ColumnFiltersState) => ({
  createdByUserIds: readMultiSelectFilter(columnFilters, 'createdByUserId'),
});

const hintStatusLabels = {
  not_saved: 'Not saved yet',
  no_correction: 'No correction',
  not_english: 'Not English, so skipped',
  pending: 'Pending',
  hint_added: 'Hint added',
  no_hint: 'No hint',
  unknown: 'Derived before outcomes were kept',
} as const satisfies Record<TranscriptionHintStatus['kind'], string>;

function HintStatus({ id, status }: { id: string; status: TranscriptionHintStatus }) {
  const many = status.kind === 'hint_added' && status.hintIds.length > 1;
  return (
    <div className="grid min-w-36 gap-1">
      <Badge variant={status.kind === 'hint_added' ? 'default' : 'outline'}>
        {many ? `${formatNumber(status.hintIds.length)} hints added` : hintStatusLabels[status.kind]}
      </Badge>
      {status.kind === 'hint_added' ? (
        <Link
          className="text-sm underline underline-offset-2"
          to="/contracting/transcriptions"
          search={{ tab: 'hints', from: id }}
        >
          {many ? 'View the hints' : 'View the hint'}
        </Link>
      ) : null}
      {status.kind === 'no_hint' ? (
        <span className="text-sm text-muted-foreground">{status.reason || 'No reason given.'}</span>
      ) : null}
    </div>
  );
}

/** Every user's Transcriptions, newest first: heard, shown, kept, and where the hint derivation stands. */
export function TranscriptionTable() {
  const trpc = useTRPC();
  const tableController = useServerSideTableController({
    store: useTranscriptionTableStore,
    sortOptions: transcriptionSortOptions,
    getListInputExtras: transcriptionListInputExtras,
  });
  const query = useInfiniteQuery(
    trpc.contractingTranscriptions.list.infiniteQueryOptions(tableController.listInput, {
      ...cursorInfiniteQueryOptions,
      placeholderData: keepPreviousData,
    }),
  );
  const { items, total } = useCombinedCursorQueryPages(query.data?.pages);
  const users = useQuery(trpc.contractingTranscriptions.users.queryOptions());
  const userOptions = useMemo(
    () => (users.data ?? []).map((person) => ({ label: person.name, value: person.id })),
    [users.data],
  );
  const columns = useMemo<DataTableColumnDef<TranscriptionReviewItem>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'When',
        enableColumnFilter: false,
        enableSorting: true,
        cell: ({ row }) => <DateDisplay date={row.original.createdAt} format="medium" />,
      },
      {
        accessorKey: 'createdByUserId',
        header: 'Recorded by',
        enableColumnFilter: true,
        enableSorting: false,
        meta: { filterOptions: userOptions, filterVariant: 'multi-select' },
        cell: ({ row }) => <span className="min-w-28">{row.original.createdByName}</span>,
      },
      {
        accessorKey: 'purpose',
        header: 'Purpose',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => (
          <div className="grid min-w-28 gap-0.5">
            <span>{row.original.purpose}</span>
            <span className="text-sm text-muted-foreground">{row.original.language ?? 'Language unknown'}</span>
          </div>
        ),
      },
      {
        id: 'text',
        header: 'Heard → shown → kept',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => <TranscriptionTexts {...row.original} />,
      },
      {
        id: 'hint',
        header: 'Hint',
        enableColumnFilter: false,
        enableSorting: false,
        cell: ({ row }) => <HintStatus id={row.original.id} status={row.original.hintStatus} />,
      },
    ],
    [userOptions],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableSortingRemoval: false,
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onSortingChange: tableController.setSorting,
    state: { columnFilters: tableController.columnFilters, sorting: tableController.sorting },
  });
  return (
    <DataTable
      emptyMessage="No Voice Notes yet."
      errorMessage={getApiQueryErrorMessage(query.error, 'Unable to load Transcriptions.')}
      hideGlobalFilter
      isLoading={query.isPending}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: query.hasNextPage,
        isFetchingNextPage: query.isFetchingNextPage,
        loadedCount: items.length,
        onLoadMore: () => void query.fetchNextPage(),
      }}
      table={table}
      total={total}
      totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'Transcription' : 'Transcriptions'}`}
    />
  );
}
