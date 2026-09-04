import type { UUID } from '@pkg/schema';
import type { StocktakeUncountedPart } from '@pkg/schema/equipment';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cursorInfiniteQueryOptions, useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { formatPartQuantity } from '@/equipment/utils/part-quantity-format.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

/** A page of the scope, not the scope. The list is as long as the Parts the walk has to cover. */
const UNCOUNTED_PAGE_SIZE = 25;

const uncountedColumns: DataTableColumnDef<StocktakeUncountedPart>[] = [
  {
    accessorFn: (item) => `${item.partName} ${item.partCode}`,
    cell: ({ row }) => (
      <>
        <Link className="block font-medium" params={{ partId: row.original.partId }} to="/equipment/inventory/$partId">
          {row.original.partName}
        </Link>
        <span className="block text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Part',
    id: 'part',
  },
  {
    accessorKey: 'quantity',
    cell: ({ row }) => formatPartQuantity(row.original.quantity, row.original.unitOfMeasure),
    header: 'Recorded stock',
    meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
  },
];

/**
 * The session's to-do while it is open, and its skip list once it closes — the same list, read at
 * two moments. Nothing here is stored: a Part is uncounted exactly while the session holds no count
 * movement for it.
 *
 * Server-paged rather than filtered in the browser, because at the start of a walk this list *is*
 * the scope. It is deliberately unsearchable: the order is Part code and the question it answers is
 * "how much is left", not "is this one done" — the tablet answers that by scanning the label.
 */
export function StocktakeUncountedTable({ isClosed, sessionId }: { isClosed: boolean; sessionId: UUID }) {
  const trpc = useTRPC();
  const uncountedQuery = useInfiniteQuery(
    trpc.inventory.stocktakeUncounted.infiniteQueryOptions(
      { limit: UNCOUNTED_PAGE_SIZE, sessionId },
      cursorInfiniteQueryOptions,
    ),
  );
  const { items, total } = useCombinedCursorQueryPages(uncountedQuery.data?.pages);
  const table = useDataTable({
    columns: uncountedColumns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
  });

  return (
    <DataTable
      emptyMessage={isClosed ? 'Nothing was skipped — the whole scope was counted.' : 'Every Part in scope is counted.'}
      errorMessage={getApiQueryErrorMessage(uncountedQuery.error, 'Unable to load what this session has not counted.')}
      hideGlobalFilter
      isLoading={uncountedQuery.isPending}
      loadMore={{
        hasNextPage: uncountedQuery.hasNextPage,
        isFetchingNextPage: uncountedQuery.isFetchingNextPage,
        loadedCount: items.length,
        onLoadMore: () => void uncountedQuery.fetchNextPage(),
      }}
      paginationMode="cursor"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'Part' : 'Parts'}`}
    />
  );
}
