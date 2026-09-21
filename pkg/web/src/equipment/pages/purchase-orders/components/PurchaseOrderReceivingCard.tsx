import { formatDate, formatNumber } from '@pkg/domain';
import type { PurchaseOrderArrival, PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconArrowBackUp, IconTruckDelivery } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { PartLabelPrintButton } from '@/equipment/pages/parts/PartLabelPrintButton.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderArrivalDialog } from './PurchaseOrderArrivalDialog.js';
import { PurchaseOrderReceiveDialog } from './PurchaseOrderReceiveDialog.js';
import { outstandingQuantity } from './types.js';

/**
 * The dock's view of a sent order: what each line still owes, and the one action that posts it.
 * A refused-at-dock delivery is simply not received — nothing here records it.
 */
export function PurchaseOrderReceivingCard({
  canReadCosts,
  canReceive,
  canReverse,
  purchaseOrder,
}: {
  canReadCosts: boolean;
  canReceive: boolean;
  canReverse: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const [active, setActive] = useState<{ lineId: string; reverse: boolean } | null>(null);
  const receivingLine = purchaseOrder.lines.find((line) => line.id === active?.lineId) ?? null;
  const hasCustomLines = purchaseOrder.lines.some((line) => line.kind === 'custom');
  const trpc = useTRPC();
  const arrivalsQuery = useQuery({
    ...trpc.purchaseOrders.arrivals.queryOptions({ id: purchaseOrder.id }),
    enabled: hasCustomLines,
  });
  const arrivals = arrivalsQuery.data?.items ?? [];
  const columns = useMemo<DataTableColumnDef<PurchaseOrderLineView>[]>(
    () => [
      {
        accessorFn: (line) => line.description,
        cell: ({ row }) => (
          <>
            {row.original.kind === 'part' ? (
              <>
                <span className="font-medium">{row.original.partCode}</span> ·{' '}
              </>
            ) : null}
            {row.original.description}
          </>
        ),
        header: 'Line',
        id: 'line',
      },
      {
        accessorKey: 'receivedQuantity',
        cell: ({ row }) => `${row.original.receivedQuantity} / ${row.original.quantity}`,
        header: 'Received',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        accessorFn: outstandingQuantity,
        header: 'Outstanding',
        id: 'outstanding',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            {/* Labels go on stock that has actually landed, so the button appears with the first receipt. */}
            {row.original.kind === 'part' && row.original.receivedQuantity > 0 ? (
              <PartLabelPrintButton partId={row.original.partId} size="sm" />
            ) : null}
            {canReceive ? (
              <Button onClick={() => setActive({ lineId: row.original.id, reverse: false })} size="sm" type="button">
                <IconTruckDelivery data-icon="inline-start" /> Receive
              </Button>
            ) : null}
            {row.original.kind === 'custom' && row.original.receivedQuantity > 0 && canReverse ? (
              <Button
                onClick={() => setActive({ lineId: row.original.id, reverse: true })}
                size="sm"
                type="button"
                variant="outline"
              >
                <IconArrowBackUp data-icon="inline-start" /> Reverse arrival
              </Button>
            ) : null}
          </div>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: 'actions',
      },
    ],
    [canReceive, canReverse],
  );
  const table = useDataTable({
    columns,
    data: purchaseOrder.lines,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (line) => line.id,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving</CardTitle>
        <CardDescription>
          Confirm what arrived at the dock. The Purchase Order price is used unless an authorized receiver overrides it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          emptyMessage="No lines to receive."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={purchaseOrder.lines.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'line' : 'lines'}`}
        />
        {hasCustomLines ? <ArrivalHistory items={arrivals} /> : null}
      </CardContent>
      {receivingLine?.kind === 'custom' ? (
        <PurchaseOrderArrivalDialog
          key={`${receivingLine.id}:${active?.reverse}`}
          line={receivingLine}
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
          purchaseOrder={purchaseOrder}
          reverse={active?.reverse ?? false}
        />
      ) : receivingLine ? (
        <PurchaseOrderReceiveDialog
          canReadCosts={canReadCosts}
          // Remount per line so the dialog's prefilled outstanding quantity follows the line it opens on.
          key={receivingLine.id}
          line={receivingLine}
          onOpenChange={(open) => {
            if (!open) setActive(null);
          }}
          open
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </Card>
  );
}

function ArrivalHistory({ items }: { items: PurchaseOrderArrival[] }) {
  const columns = useMemo<DataTableColumnDef<PurchaseOrderArrival>[]>(
    () => [
      { accessorKey: 'createdAt', cell: ({ row }) => formatDate(row.original.createdAt, 'medium'), header: 'When' },
      { accessorKey: 'lineDescription', header: 'Line' },
      {
        accessorKey: 'quantity',
        cell: ({ row }) => `${row.original.quantity > 0 ? '+' : ''}${formatNumber(row.original.quantity)}`,
        header: 'Quantity',
      },
      { accessorFn: (row) => row.actorName ?? 'System', header: 'By', id: 'actor' },
      { accessorFn: (row) => row.note ?? '—', header: 'Note', id: 'note' },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (row) => row.id,
  });
  return (
    <div className="mt-6">
      <h3 className="mb-3 font-medium">Arrivals</h3>
      <DataTable
        emptyMessage="No arrivals yet."
        hideGlobalFilter
        paginationMode="complete"
        table={table}
        total={items.length}
        totalLabel={(value) => `${value} ${value === 1 ? 'arrival' : 'arrivals'}`}
      />
    </div>
  );
}
