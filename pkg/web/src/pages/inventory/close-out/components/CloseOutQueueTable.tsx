import { formatDate } from '@pkg/domain';
import type { CloseOutQueueRow } from '@pkg/schema';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Badge } from '@/components/ui/badge.js';

type CloseOutQueueTableProps = {
  errorMessage: string | undefined;
  isLoading: boolean;
  items: CloseOutQueueRow[];
};

const closeOutQueueColumns: ColumnDef<CloseOutQueueRow>[] = [
  {
    accessorFn: (item) => `${item.displayName} ${item.code}`,
    cell: ({ row }) => (
      <>
        <Link className="block font-medium" params={{ jobId: row.original.jobId }} to="/inventory/close-out/$jobId">
          {row.original.displayName}
        </Link>
        <span className="block font-mono text-muted-foreground text-xs">{row.original.code}</span>
      </>
    ),
    header: 'Job',
    id: 'job',
  },
  {
    accessorKey: 'completedOn',
    cell: ({ row }) => formatDate(row.original.completedOn),
    header: 'Completed',
  },
  {
    accessorKey: 'ageDays',
    cell: ({ row }) =>
      row.original.isStale ? (
        <Badge variant="destructive">{formatWaiting(row.original.ageDays)}</Badge>
      ) : (
        <span className="text-muted-foreground">{formatWaiting(row.original.ageDays)}</span>
      ),
    header: 'Waiting',
  },
  {
    accessorKey: 'drawnPartCount',
    header: 'Parts drawn',
    meta: {
      cellClassName: 'text-right tabular-nums',
      headerClassName: 'text-right',
    },
  },
  {
    accessorKey: 'committedPartCount',
    header: 'Parts committed',
    meta: {
      cellClassName: 'text-right tabular-nums',
      headerClassName: 'text-right',
    },
  },
];

export function CloseOutQueueTable({ errorMessage, isLoading, items }: CloseOutQueueTableProps) {
  const navigate = useNavigate();
  const table = useReactTable({
    columns: closeOutQueueColumns,
    data: items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    initialState: {
      sorting: [{ desc: false, id: 'completedOn' }],
    },
  });

  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No completed Jobs are waiting to be closed out."
      errorMessage={errorMessage}
      getRowAriaLabel={(item) => `Open close-out for ${item.code}`}
      globalFilterPlaceholder="Search close-out queue..."
      isLoading={isLoading}
      onRowClick={(item) => navigate({ params: { jobId: item.jobId }, to: '/inventory/close-out/$jobId' })}
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'Job' : 'Jobs'}`}
    />
  );
}

function formatWaiting(ageDays: number): string {
  if (ageDays === 0) return 'today';

  return ageDays === 1 ? '1 day' : `${ageDays} days`;
}
