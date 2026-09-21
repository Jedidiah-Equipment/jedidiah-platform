import { formatDate, formatNumber } from '@pkg/domain';
import type { PurchaseOrderArrival, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconArrowBackUp } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
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
  // Only a line something has arrived against, and kept, has anything to reverse.
  const reversibleLines = customLines.filter((line) => line.receivedQuantity > 0);
  const reversingLine = reversibleLines.find((line) => line.id === reversingLineId) ?? null;
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
        {canReverse ? (
          <CardAction>
            <div className="flex flex-wrap gap-2">
              {reversibleLines.map((line) => (
                <Button
                  key={line.id}
                  onClick={() => setReversingLineId(line.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <IconArrowBackUp data-icon="inline-start" /> Reverse {line.description}
                </Button>
              ))}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent>
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
