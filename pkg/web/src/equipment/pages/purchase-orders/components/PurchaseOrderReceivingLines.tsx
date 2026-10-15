import { formatNumber } from '@pkg/domain';
import { formatPartQuantityValue } from '@pkg/domain/equipment';
import type { PurchaseOrderLineView, PurchaseOrderView } from '@pkg/schema/equipment';
import { IconTruckDelivery } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Button } from '@/components/ui/button.js';
import { PartLabelPrintButton } from '@/equipment/pages/parts/PartLabelPrintButton.js';
import { PurchaseOrderArrivalDialog } from './PurchaseOrderArrivalDialog.js';
import { PurchaseOrderReceiveDialog } from './PurchaseOrderReceiveDialog.js';
import { outstandingQuantity } from './types.js';

/**
 * Each line's receiving progress with its Receive action, handing Part Lines to the Receive dialog and
 * Custom Lines to the Arrival dialog. Callers choose which of the order's lines to show.
 */
export function PurchaseOrderReceivingLines({
  canReadCosts,
  canReceive,
  lines,
  purchaseOrder,
}: {
  canReadCosts: boolean;
  canReceive: boolean;
  lines: PurchaseOrderLineView[];
  purchaseOrder: PurchaseOrderView;
}) {
  const [receivingLineId, setReceivingLineId] = useState<string | null>(null);
  const receivingLine = purchaseOrder.lines.find((line) => line.id === receivingLineId) ?? null;
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
        cell: ({ row }) =>
          `${formatPartQuantityValue(row.original.receivedQuantity)} / ${formatPartQuantityValue(row.original.quantity)}`,
        header: 'Received',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        accessorFn: outstandingQuantity,
        cell: ({ row }) => formatPartQuantityValue(outstandingQuantity(row.original)),
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
              <Button onClick={() => setReceivingLineId(row.original.id)} size="sm" type="button">
                <IconTruckDelivery data-icon="inline-start" /> Receive
              </Button>
            ) : null}
          </div>
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: 'actions',
      },
    ],
    [canReceive],
  );
  const table = useDataTable({
    columns,
    data: lines,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (line) => line.id,
  });

  return (
    <>
      <DataTable
        emptyMessage="No lines to receive."
        hideGlobalFilter
        paginationMode="complete"
        table={table}
        total={lines.length}
        totalLabel={(value) => `${formatNumber(value)} ${value === 1 ? 'line' : 'lines'}`}
      />
      {receivingLine?.kind === 'custom' ? (
        <PurchaseOrderArrivalDialog
          key={receivingLine.id}
          line={receivingLine}
          onOpenChange={(open) => setReceivingLineId(open ? receivingLineId : null)}
          purchaseOrder={purchaseOrder}
          reverse={false}
        />
      ) : receivingLine ? (
        <PurchaseOrderReceiveDialog
          canReadCosts={canReadCosts}
          // Remount per line so the dialog's prefilled outstanding quantity follows the line it opens on.
          key={receivingLine.id}
          line={receivingLine}
          onOpenChange={(open) => setReceivingLineId(open ? receivingLineId : null)}
          open
          purchaseOrder={purchaseOrder}
        />
      ) : null}
    </>
  );
}
