import type { PurchaseOrderView } from '@pkg/schema';
import { IconTruckDelivery } from '@tabler/icons-react';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { PartLabelPrintButton } from '../../parts/PartLabelPrintButton.js';
import { PurchaseOrderReceiveDialog } from './PurchaseOrderReceiveDialog.js';
import { outstandingQuantity } from './types.js';

/**
 * The dock's view of a sent order: what each line still owes, and the one action that posts it.
 * A refused-at-dock delivery is simply not received — nothing here records it.
 */
export function PurchaseOrderReceivingCard({
  canReadCosts,
  purchaseOrder,
}: {
  canReadCosts: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const [receivingPartId, setReceivingPartId] = useState<string | null>(null);
  const receivingLine = purchaseOrder.lines.find((line) => line.partId === receivingPartId) ?? null;
  const columns = useMemo<ColumnDef<PurchaseOrderView['lines'][number]>[]>(
    () => [
      {
        accessorFn: (line) => `${line.partCode} ${line.partName}`,
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.partCode}</span> · {row.original.partName}
          </>
        ),
        header: 'Part',
        id: 'part',
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
            {row.original.receivedQuantity > 0 ? <PartLabelPrintButton partId={row.original.partId} size="sm" /> : null}
            <Button onClick={() => setReceivingPartId(row.original.partId)} size="sm" type="button">
              <IconTruckDelivery data-icon="inline-start" /> Receive
            </Button>
          </div>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: 'actions',
      },
    ],
    [],
  );
  const table = useReactTable({
    columns,
    data: purchaseOrder.lines,
    enableColumnFilters: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (line) => line.partId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receiving</CardTitle>
        <CardDescription>
          Confirm what arrived at the dock. The Purchase Order price is used unless an authorized receiver overrides it.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <DataTable
          emptyMessage="No Parts to receive."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={purchaseOrder.lines.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'part' : 'parts'}`}
        />
      </CardContent>
      {receivingLine ? (
        <PurchaseOrderReceiveDialog
          canReadCosts={canReadCosts}
          // Remount per line so the dialog's prefilled outstanding quantity follows the line it opens on.
          key={receivingLine.partId}
          line={receivingLine}
          onOpenChange={(open) => setReceivingPartId(open ? receivingPartId : null)}
          open
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </Card>
  );
}
