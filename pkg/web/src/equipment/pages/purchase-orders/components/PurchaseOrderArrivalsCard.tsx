import { formatDate, formatNumber } from '@pkg/domain';
import type { PurchaseOrderArrival, PurchaseOrderCustomLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderArrivalDialog } from './PurchaseOrderArrivalDialog.js';

/**
 * A Custom Line's counterpart to the returns card: the append-only history of what turned up, and
 * the one correction it allows. A reversal outlives Close Short exactly as a return does, which is
 * why this card does not hang off the right to receive.
 */
export function PurchaseOrderArrivalsCard({
  canReverse,
  purchaseOrder,
}: {
  canReverse: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const customLines = purchaseOrder.lines.filter((line) => line.kind === 'custom');
  const query = useQuery({
    ...trpc.purchaseOrders.arrivals.queryOptions({ id: purchaseOrder.id }),
    enabled: customLines.length > 0,
  });
  const arrivals = useMemo(() => query.data?.items ?? [], [query.data]);
  const [reversingLineId, setReversingLineId] = useState<string | null>(null);
  const reversingLine = customLines.find((line) => line.id === reversingLineId) ?? null;
  // Descriptions may repeat on one order, so the reversal sits on the line's own row, beside the
  // quantities that tell two "Packing tape" lines apart.
  const lineColumns = useMemo<DataTableColumnDef<PurchaseOrderCustomLineView>[]>(
    () => [
      {
        accessorKey: 'description',
        cell: ({ row }) => (
          <>
            {row.original.description}
            {row.original.supplierCode ? (
              <span className="text-muted-foreground"> · {row.original.supplierCode}</span>
            ) : null}
          </>
        ),
        header: 'Line',
      },
      {
        accessorKey: 'receivedQuantity',
        cell: ({ row }) =>
          `${formatNumber(row.original.receivedQuantity)} / ${formatNumber(row.original.quantity)} ${row.original.unit}`,
        header: 'Arrived',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      ...(canReverse
        ? [
            {
              cell: ({ row }) =>
                // Only a line that has kept something has anything to reverse.
                row.original.receivedQuantity > 0 ? (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => setReversingLineId(row.original.id)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <IconArrowBackUp data-icon="inline-start" /> Reverse arrival
                    </Button>
                  </div>
                ) : null,
              enableSorting: false,
              header: () => <span className="sr-only">Actions</span>,
              id: 'actions',
            } satisfies DataTableColumnDef<PurchaseOrderCustomLineView>,
          ]
        : []),
    ],
    [canReverse],
  );
  const lineTable = useDataTable({
    columns: lineColumns,
    // A line nothing ever arrived against has no place on a card about Arrivals.
    data: customLines.filter((line) => line.hasStockMovements),
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (line) => line.id,
  });
  const columns = useMemo<DataTableColumnDef<PurchaseOrderArrival>[]>(
    () => [
      { accessorKey: 'createdAt', cell: ({ row }) => formatDate(row.original.createdAt, 'medium'), header: 'When' },
      { accessorKey: 'lineDescription', header: 'Line' },
      {
        accessorKey: 'quantity',
        cell: ({ row }) => `${row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
        header: 'Quantity',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      { accessorFn: (row) => row.actorName ?? 'System', header: 'By', id: 'actor' },
      { accessorFn: (row) => row.note ?? '—', header: 'Note', id: 'note' },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: arrivals,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (row) => row.id,
  });

  if (arrivals.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Arrivals</CardTitle>
        <CardDescription>
          What has turned up against this order's Custom Lines. They are not stock, so an arrival is corrected by
          reversing it, never by a return.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <DataTable
          emptyMessage="No arrivals yet."
          hideGlobalFilter
          paginationMode="complete"
          table={lineTable}
          total={lineTable.getRowModel().rows.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'line' : 'lines'}`}
        />
        <DataTable
          emptyMessage="No arrivals yet."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={arrivals.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'arrival' : 'arrivals'}`}
        />
      </CardContent>
      {reversingLine ? (
        <PurchaseOrderArrivalDialog
          // Remount per line so the prefilled quantity follows the line the dialog opens on.
          key={reversingLine.id}
          line={reversingLine}
          onOpenChange={(open) => setReversingLineId(open ? reversingLineId : null)}
          purchaseOrder={purchaseOrder}
          reverse
        />
      ) : null}
    </Card>
  );
}
