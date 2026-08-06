import { formatDate, stocktakeSessionStatusOf } from '@pkg/domain';
import { STOCKTAKE_SCOPE_LABELS, type StocktakeSession } from '@pkg/schema';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';

import { StocktakeSessionStatusBadge } from './StocktakeSessionStatusBadge.js';

const sessionColumns: ColumnDef<StocktakeSession>[] = [
  {
    accessorFn: (item) => STOCKTAKE_SCOPE_LABELS[item.scope],
    cell: ({ row }) => (
      <Link className="block font-medium" params={{ sessionId: row.original.id }} to="/inventory/stocktake/$sessionId">
        {STOCKTAKE_SCOPE_LABELS[row.original.scope]}
      </Link>
    ),
    header: 'Scope',
    id: 'scope',
  },
  {
    accessorKey: 'openedAt',
    cell: ({ row }) => (
      <>
        <span className="block">{formatDate(row.original.openedAt)}</span>
        <span className="block text-muted-foreground text-xs">{row.original.openedByName}</span>
      </>
    ),
    header: 'Opened',
  },
  {
    accessorFn: (item) => item.closedAt ?? '',
    cell: ({ row }) =>
      row.original.closedAt === null ? (
        <StocktakeSessionStatusBadge status={stocktakeSessionStatusOf(row.original)} />
      ) : (
        <>
          <span className="block">{formatDate(row.original.closedAt)}</span>
          <span className="block text-muted-foreground text-xs">{row.original.closedByName}</span>
        </>
      ),
    header: 'Closed',
    id: 'closedAt',
  },
  {
    accessorKey: 'countedPartCount',
    header: 'Parts counted',
    meta: {
      cellClassName: 'text-right tabular-nums',
      headerClassName: 'text-right',
    },
  },
];

export function StocktakeSessionsTable({
  errorMessage,
  isLoading,
  items,
}: {
  errorMessage: string | undefined;
  isLoading: boolean;
  items: StocktakeSession[];
}) {
  const navigate = useNavigate();
  const table = useReactTable({
    columns: sessionColumns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: { sorting: [{ desc: true, id: 'openedAt' }] },
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No stocktake session has been opened yet."
      errorMessage={errorMessage}
      getRowAriaLabel={(item) => `Open the ${STOCKTAKE_SCOPE_LABELS[item.scope]} session`}
      globalFilterPlaceholder="Search stocktake sessions..."
      isLoading={isLoading}
      onRowClick={(item) => navigate({ params: { sessionId: item.id }, to: '/inventory/stocktake/$sessionId' })}
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'session' : 'sessions'}`}
    />
  );
}
