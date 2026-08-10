import { formatDate } from '@pkg/domain';
import type { RawMaterialDriftReport, RawMaterialDriftRow } from '@pkg/schema';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';

import { DataTable } from '@/components/data-table/DataTable.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';

const columns: ColumnDef<RawMaterialDriftRow>[] = [
  {
    accessorFn: (row) => `${row.partName} ${row.partCode}`,
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.partName}</span>
        <span className="text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Raw material',
    id: 'part',
  },
  {
    accessorKey: 'expectedConsumptionFloor',
    cell: ({ row }) => formatPartQuantity(row.original.expectedConsumptionFloor, row.original.unitOfMeasure),
    header: 'Expected floor',
  },
  {
    accessorKey: 'actualConsumption',
    cell: ({ row }) =>
      row.original.actualConsumption === null
        ? 'Not counted'
        : formatPartQuantity(row.original.actualConsumption, row.original.unitOfMeasure),
    header: 'Actual depletion',
  },
  {
    accessorKey: 'driftFromExpectedFloor',
    cell: ({ row }) => {
      const drift = row.original.driftFromExpectedFloor;
      if (drift === null) return 'Not counted';

      return `${drift > 0 ? '+' : ''}${formatPartQuantity(drift, row.original.unitOfMeasure)}`;
    },
    header: 'Drift from floor',
  },
];

export function RawMaterialDriftTable({ report }: { report: RawMaterialDriftReport }) {
  const table = useReactTable({ columns, data: report.items, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-sm">
        Completed Product Jobs after {formatDate(report.fromCompletedOnExclusive)} through{' '}
        {formatDate(report.throughCompletedOn)}. Expected consumption is a floor because Jobs without a completion date
        do not count.
      </p>
      <DataTable
        emptyMessage="No raw-material consumption to compare."
        globalFilterPlaceholder="Search raw-material drift..."
        paginationMode="complete"
        table={table}
        total={report.items.length}
        totalLabel={(total) => `${total} ${total === 1 ? 'material' : 'materials'}`}
      />
    </div>
  );
}
