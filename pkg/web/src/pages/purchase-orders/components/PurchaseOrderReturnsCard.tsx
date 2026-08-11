import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import {
  type PurchaseOrderReturnRow,
  type PurchaseOrderView,
  STOCK_RETURN_TO_SUPPLIER_REASON_LABELS,
} from '@pkg/schema';
import { IconArrowBackUp, IconReceipt2 } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderCreditNoteDialog } from './PurchaseOrderCreditNoteDialog.js';
import { PurchaseOrderReturnDialog } from './PurchaseOrderReturnDialog.js';

/**
 * What has gone back to the Supplier off this order, and whether a credit note has answered it yet.
 *
 * The settled column is the whole point of the card: a return with no credit note against it is
 * money the plant is still owed, which is exactly what the returns-awaiting-credit signal chases
 * (spec §12).
 */
export function PurchaseOrderReturnsCard({
  canFileCreditNote,
  canReadCosts,
  canReturn,
  purchaseOrder,
}: {
  canFileCreditNote: boolean;
  canReadCosts: boolean;
  canReturn: boolean;
  purchaseOrder: PurchaseOrderView;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.purchaseOrders.returns.queryOptions({ purchaseOrderId: purchaseOrder.id }));
  const returns = useMemo(() => query.data?.items ?? [], [query.data]);
  const [returningPartId, setReturningPartId] = useState<string | null>(null);
  const [isFilingCreditNote, setIsFilingCreditNote] = useState(false);
  const returningLine = purchaseOrder.lines.find((line) => line.partId === returningPartId) ?? null;
  // Only a line something actually arrived against can send anything back.
  const returnableLines = purchaseOrder.lines.filter((line) => line.receivedQuantity > 0);
  const unsettledReturns = returns.filter((row) => row.settledByDocumentId === null);
  const columns = useMemo<ColumnDef<PurchaseOrderReturnRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => formatDate(row.original.createdAt, 'medium'),
        header: 'When',
      },
      {
        accessorFn: (row) => `${row.partCode} ${row.partName}`,
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.partCode}</span> · {row.original.partName}
          </>
        ),
        header: 'Part',
        id: 'part',
      },
      {
        accessorKey: 'quantity',
        cell: ({ row }) => formatNumber(row.original.quantity),
        header: 'Quantity',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        accessorFn: (row) => STOCK_RETURN_TO_SUPPLIER_REASON_LABELS[row.reason],
        header: 'Reason',
        id: 'reason',
      },
      ...(canReadCosts
        ? [
            {
              accessorKey: 'value',
              cell: ({ row }) => (row.original.value === null ? '—' : formatCurrency(row.original.value, 'ZAR')),
              header: 'Value reversed',
              meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
            } satisfies ColumnDef<PurchaseOrderReturnRow>,
          ]
        : []),
      {
        cell: ({ row }) =>
          row.original.settledByDocumentId === null ? (
            <Badge variant="outline">Awaiting credit</Badge>
          ) : (
            <span className="text-muted-foreground">{row.original.settledByDocumentFilename}</span>
          ),
        header: 'Credit note',
        id: 'creditNote',
      },
    ],
    [canReadCosts],
  );
  const table = useReactTable({
    columns,
    data: returns,
    enableColumnFilters: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  if (returns.length === 0 && returnableLines.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Returns to Supplier</CardTitle>
        <CardDescription>
          Stock sent back reverses at the price it was received at. A credit note settles what the Supplier owes.
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap gap-2">
            {canFileCreditNote && unsettledReturns.length > 0 ? (
              <Button onClick={() => setIsFilingCreditNote(true)} size="sm" type="button" variant="outline">
                <IconReceipt2 data-icon="inline-start" /> Record credit note
              </Button>
            ) : null}
            {canReturn
              ? returnableLines.map((line) => (
                  <Button
                    key={line.partId}
                    onClick={() => setReturningPartId(line.partId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <IconArrowBackUp data-icon="inline-start" /> Return {line.partCode}
                  </Button>
                ))
              : null}
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {!canReturn && returnableLines.length > 0 ? (
          <p className="pb-4 text-sm text-muted-foreground">
            A Stores user or someone who can amend Purchase Orders must post the return.
          </p>
        ) : null}
        <DataTable
          emptyMessage="Nothing has gone back to the Supplier."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={returns.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'return' : 'returns'}`}
        />
      </CardContent>
      {returningLine ? (
        <PurchaseOrderReturnDialog
          // Remount per line so the prefilled quantity follows the line the dialog opens on.
          key={returningLine.partId}
          line={returningLine}
          onOpenChange={(open) => setReturningPartId(open ? returningPartId : null)}
          purchaseOrder={purchaseOrder}
        />
      ) : null}
      {isFilingCreditNote ? (
        <PurchaseOrderCreditNoteDialog
          onOpenChange={setIsFilingCreditNote}
          purchaseOrderId={purchaseOrder.id}
          returns={unsettledReturns}
        />
      ) : null}
    </Card>
  );
}
