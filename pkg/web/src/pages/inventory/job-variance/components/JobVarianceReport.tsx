import { formatCurrency, formatDate } from '@pkg/domain';
import { isOffCfo, type JobMaterialVarianceResult, type JobMaterialVarianceRow } from '@pkg/schema';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Badge } from '@/components/ui/badge.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';

/**
 * What the Job planned against what it actually drew, and what those draws cost (spec §3). Variances
 * are signed on purpose: an under-draw is as much a plan that was wrong as an over-draw is.
 *
 * `showCosts` is UX only — the server already nulls the money for a caller who may not read costs.
 * Dropping the column rather than showing a row of dashes is what keeps the price-blind reading of
 * this report about quantities, which is the half a storeman is meant to act on; the counted totals
 * beside it are shown to everyone for the same reason.
 */
export function JobVarianceReport({ report, showCosts }: { report: JobMaterialVarianceResult; showCosts: boolean }) {
  const columns = useMemo(() => createVarianceColumns(showCosts), [showCosts]);
  const table = useReactTable({
    columns,
    data: report.items,
    enableColumnFilters: false,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (report.items.length === 0) {
    return <p className="text-muted-foreground text-sm">No CFO or stock movements for this Job.</p>;
  }

  return (
    <div className="grid gap-3">
      <JobVarianceTotals report={report} showCosts={showCosts} />
      <DataTable
        emptyMessage="No CFO or stock movements for this Job."
        globalFilterPlaceholder="Search Job variance..."
        paginationMode="complete"
        table={table}
        total={table.getFilteredRowModel().rows.length}
        totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
      />
    </div>
  );
}

/**
 * Job-level totals. Quantities are **counted, never summed** — one Job's Parts span pieces, lengths
 * and weights, so a single number across them would mean nothing. Money does sum, and the off-CFO
 * share is called out beside the total that contains it: unplanned material is the thing this report
 * exists to surface, and a lone total would bury it.
 */
function JobVarianceTotals({ report, showCosts }: { report: JobMaterialVarianceResult; showCosts: boolean }) {
  const overPlanCount = report.items.filter((item) => item.varianceQuantity > 0).length;
  const offCfoCount = report.items.filter(isOffCfo).length;

  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-muted-foreground text-sm">
      <p>
        Over plan: <span className="font-medium tabular-nums text-foreground">{overPlanCount}</span>
      </p>
      <p>
        Off CFO: <span className="font-medium tabular-nums text-foreground">{offCfoCount}</span>
      </p>
      {showCosts ? (
        <>
          <p>
            Drawn cost:{' '}
            <span className="font-medium tabular-nums text-foreground">{formatActualCost(report.totalActualCost)}</span>
          </p>
          <p>
            Off-CFO cost:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {formatActualCost(report.offCfoActualCost)}
            </span>
          </p>
        </>
      ) : null}
    </div>
  );
}

/** A total is unpriced as soon as one drawn Part has no cost — never quietly smaller. */
function formatActualCost(value: number | null): string {
  return value === null ? 'not priced' : formatCurrency(value, 'ZAR');
}

/** How the Job's stock life stands, since this report is read as often after close-out as before. */
export function describeVarianceJob(job: JobMaterialVarianceResult['job']): string {
  if (job.closedOutAt !== null) return `${job.code} · closed out ${formatDate(job.closedOutAt)}`;
  if (job.cancelledAt !== null) return `${job.code} · cancelled`;
  if (job.completedOn !== null) return `${job.code} · completed ${formatDate(job.completedOn)}`;

  return `${job.code} · still running`;
}

function createVarianceColumns(showCosts: boolean): ColumnDef<JobMaterialVarianceRow>[] {
  return [
    {
      accessorFn: (item) => `${item.partName} ${item.partCode}`,
      cell: ({ row }) => (
        <>
          <span className="block font-medium">{row.original.partName}</span>
          <span className="flex items-center gap-2 text-muted-foreground text-xs">
            {row.original.partCode}
            {/* The Job's CFO never asked for this Part — every draw on a Custom Job reads this way. */}
            {isOffCfo(row.original) ? <Badge variant="outline">Off CFO</Badge> : null}
          </span>
        </>
      ),
      header: 'Part',
      id: 'part',
    },
    {
      accessorKey: 'plannedQuantity',
      cell: ({ row }) => formatPartQuantity(row.original.plannedQuantity, row.original.unitOfMeasure),
      header: 'Planned',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorKey: 'drawnQuantity',
      cell: ({ row }) => formatPartQuantity(row.original.drawnQuantity, row.original.unitOfMeasure),
      header: 'Drawn',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorKey: 'varianceQuantity',
      cell: ({ row }) => (
        <span className={row.original.varianceQuantity > 0 ? 'font-medium text-destructive' : undefined}>
          {row.original.varianceQuantity > 0 ? '+' : ''}
          {formatPartQuantity(row.original.varianceQuantity, row.original.unitOfMeasure)}
        </span>
      ),
      header: 'Variance',
      meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
    },
    ...(showCosts
      ? [
          {
            accessorFn: (item: JobMaterialVarianceRow) => item.actualCost ?? 0,
            cell: ({ row }) =>
              row.original.actualCost === null ? (
                <span className="text-muted-foreground">No cost yet</span>
              ) : (
                formatCurrency(row.original.actualCost, 'ZAR')
              ),
            header: 'Actual cost',
            id: 'actualCost',
            meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
          } satisfies ColumnDef<JobMaterialVarianceRow>,
        ]
      : []),
  ];
}
