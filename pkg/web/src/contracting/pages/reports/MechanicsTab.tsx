import { formatDays, formatNumber, getFirstName } from '@pkg/domain';
import type { MechanicPerformanceRow, ReportWindowInput } from '@pkg/schema/contracting';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { SortingState } from '@tanstack/react-table';
import { useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import { useTRPC } from '@/lib/trpc.js';

const columns: DataTableColumnDef<MechanicPerformanceRow>[] = [
  {
    accessorKey: 'name',
    header: 'Mechanic',
    // The queue's Mechanic filter cannot express "nobody", so the Unassigned row does not link.
    cell: ({ row }) =>
      row.original.mechanicUserId === null ? (
        <span className="text-muted-foreground">{row.original.name}</span>
      ) : (
        <Link
          to="/contracting/workshop"
          search={{ mechanic: row.original.mechanicUserId }}
          className="font-medium hover:underline"
        >
          {getFirstName(row.original.name)}
        </Link>
      ),
  },
  { accessorKey: 'solvedCount', header: 'Solved', cell: ({ row }) => formatNumber(row.original.solvedCount) },
  {
    // No solved work sorts after the fastest turnaround, not as if it were zero days.
    accessorFn: (row) => row.averageReportToSolvedDays ?? undefined,
    id: 'averageReportToSolvedDays',
    sortUndefined: 'last',
    header: 'Report-to-Solved',
    cell: ({ row }) =>
      row.original.averageReportToSolvedDays === null ? '—' : formatDays(row.original.averageReportToSolvedDays),
  },
  { accessorKey: 'notSolvedCount', header: 'Not solved', cell: ({ row }) => formatNumber(row.original.notSolvedCount) },
];

/** Solved and Report-to-Solved follow the window; Not solved is the queue as it stands today. */
export function MechanicsTab({ window }: { window: ReportWindowInput }) {
  const trpc = useTRPC();
  const report = useQuery(
    trpc.contractingReports.mechanicPerformance.queryOptions(window, { placeholderData: keepPreviousData }),
  );
  // No initial sort, so the server's order (Solved, then name, Unassigned last) holds until someone sorts.
  const [sorting, setSorting] = useState<SortingState>([]);
  const rows = report.data?.rows ?? [];
  const table = useDataTable({
    columns,
    data: rows,
    getRowId: (row) => row.mechanicUserId ?? 'unassigned',
    enableColumnFilters: false,
    enableSortingRemoval: false,
    onSortingChange: setSorting,
    state: { sorting },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mechanic performance</CardTitle>
        <CardAction>
          <HelpLink label="How to read mechanic performance" topic="contractingReportsMechanics" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <DataTable
          table={table}
          total={rows.length}
          paginationMode="complete"
          hideGlobalFilter
          hideFooter
          isLoading={report.isPending}
          loadingRowCount={4}
          errorMessage={getApiQueryErrorMessage(report.error, 'Unable to load mechanic performance.')}
          emptyMessage="No Breakdowns yet."
        />
      </CardContent>
    </Card>
  );
}
