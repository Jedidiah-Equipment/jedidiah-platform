import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import {
  INVOICE_MATCH_FLAG_LABELS,
  type InvoiceMatchFlag,
  type SupplierInvoiceMatchRow,
  type SupplierInvoiceReview,
  type UUID,
} from '@pkg/schema';
import { IconFileInvoice, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-table/DataTable.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { PurchaseOrderSupplierInvoiceDialog } from './PurchaseOrderSupplierInvoiceDialog.js';

/**
 * What the Supplier billed, beside what the order agreed (spec §5).
 *
 * Advisory throughout. The cross-check is recomputed against the order's current lines every time
 * this loads, so amending a price answers its flag without anyone clicking anything; the two
 * buttons are the human confirmation the ledger waits for, and dismissing is a decision that sticks.
 */
export function PurchaseOrderInvoiceCrossCheckCard({
  canApplyPrices,
  canFileInvoice,
  purchaseOrderId,
}: {
  canApplyPrices: boolean;
  canFileInvoice: boolean;
  purchaseOrderId: UUID;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.purchaseOrders.supplierInvoices.queryOptions({ purchaseOrderId }));
  const [isFiling, setIsFiling] = useState(false);
  const invoices = query.data?.items ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Supplier invoices</CardTitle>
        <CardDescription>
          Every invoice filed against this order, read by AI and cross-checked against its lines. Flags are advice — the
          ledger only changes when you confirm a price.
        </CardDescription>
        {canFileInvoice ? (
          <CardAction>
            <Button onClick={() => setIsFiling(true)} size="sm" type="button" variant="outline">
              <IconFileInvoice data-icon="inline-start" /> File invoice
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-6">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Supplier invoice filed against this order yet.</p>
        ) : (
          invoices.map((invoice) => (
            <SupplierInvoicePanel
              canApplyPrices={canApplyPrices}
              invoice={invoice}
              key={invoice.documentId}
              purchaseOrderId={purchaseOrderId}
            />
          ))
        )}
      </CardContent>
      {isFiling ? (
        <PurchaseOrderSupplierInvoiceDialog onOpenChange={setIsFiling} purchaseOrderId={purchaseOrderId} />
      ) : null}
    </Card>
  );
}

function SupplierInvoicePanel({
  canApplyPrices,
  invoice,
  purchaseOrderId,
}: {
  canApplyPrices: boolean;
  invoice: SupplierInvoiceReview;
  purchaseOrderId: UUID;
}) {
  const trpc = useTRPC();
  const { invalidateInventory, invalidatePurchaseOrders } = useQueryInvalidation();
  const refresh = () => Promise.all([invalidatePurchaseOrders(), invalidateInventory()]);
  const applyMutation = useMutation(
    trpc.purchaseOrders.applyInvoicePrice.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success('Price confirmed and the average corrected');
      },
    }),
  );
  const dismissMutation = useMutation(
    trpc.purchaseOrders.dismissInvoiceFlag.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success('Flag dismissed');
      },
    }),
  );
  const isPending = applyMutation.isPending || dismissMutation.isPending;
  // The mutation objects are new on every render, so depending on them made the memo below never
  // hit. `mutate` is the stable half of each, and the only half the columns actually call.
  const applyPrice = applyMutation.mutate;
  const dismissFlag = dismissMutation.mutate;
  const outstanding = invoice.rows.flatMap((row) =>
    row.flags.filter((flag) => !invoice.resolutions[flag.key]).map((flag) => flag),
  );
  const columns = useMemo<ColumnDef<SupplierInvoiceMatchRow>[]>(
    () => [
      {
        cell: ({ row }) => (
          <>
            {row.original.partCode ? <span className="font-medium">{row.original.partCode}</span> : null}
            {row.original.partCode ? ' · ' : null}
            {row.original.description}
          </>
        ),
        header: 'Line',
        id: 'line',
      },
      {
        cell: ({ row }) => quantityPair(row.original),
        header: 'Ordered / invoiced',
        id: 'quantity',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        cell: ({ row }) => pricePair(row.original),
        header: 'Agreed / billed',
        id: 'price',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      {
        cell: ({ row }) =>
          row.original.flags.length === 0 ? (
            <span className="text-muted-foreground">Agrees</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.flags.map((flag) => (
                <FlagBadge flag={flag} key={flag.key} resolution={invoice.resolutions[flag.key]?.kind ?? null} />
              ))}
            </div>
          ),
        enableSorting: false,
        header: 'Cross-check',
        id: 'flags',
      },
      {
        cell: ({ row }) => (
          <RowActions
            canApplyPrices={canApplyPrices}
            invoice={invoice}
            isPending={isPending}
            onApply={(partId) => applyPrice({ documentId: invoice.documentId, partId, purchaseOrderId })}
            onDismiss={(flagKey) => dismissFlag({ documentId: invoice.documentId, flagKey, purchaseOrderId })}
            row={row.original}
          />
        ),
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        id: 'actions',
      },
    ],
    [applyPrice, canApplyPrices, dismissFlag, invoice, isPending, purchaseOrderId],
  );
  const table = useReactTable({
    columns,
    data: invoice.rows,
    enableColumnFilters: false,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row, index) => row.partId ?? `invoice-line-${index}`,
  });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{invoice.filename}</span>
          {invoice.invoiceNumber ? <span className="text-muted-foreground"> · {invoice.invoiceNumber}</span> : null}
          {invoice.invoiceDate ? (
            <span className="text-muted-foreground"> · {formatDate(invoice.invoiceDate)}</span>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {summary(invoice, outstanding.length)}
          {invoice.jobCodes.length > 0 ? ` · Job codes on the invoice: ${invoice.jobCodes.join(', ')}` : ''}
        </p>
      </div>
      {invoice.readable ? (
        <DataTable
          emptyMessage="This invoice billed nothing."
          hideGlobalFilter
          paginationMode="complete"
          table={table}
          total={invoice.rows.length}
          totalLabel={(value) => `${value} ${value === 1 ? 'line' : 'lines'}`}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          We couldn't read this invoice, so there is nothing to cross-check. The document is filed and everything else
          on this order is unaffected — check the prices against the lines yourself.
        </p>
      )}
    </div>
  );
}

function RowActions({
  canApplyPrices,
  invoice,
  isPending,
  onApply,
  onDismiss,
  row,
}: {
  canApplyPrices: boolean;
  invoice: SupplierInvoiceReview;
  isPending: boolean;
  onApply: (partId: UUID) => void;
  onDismiss: (flagKey: string) => void;
  row: SupplierInvoiceMatchRow;
}) {
  const open = row.flags.filter((flag) => !invoice.resolutions[flag.key]);
  if (open.length === 0) return null;

  const priceFlag = open.find((flag) => flag.kind === 'price-mismatch');
  const correction = row.correction;
  // Bound once so the narrowing survives into the click handler; re-reading `row.partId` there
  // would need a cast to re-assert what this branch has already established.
  const partId = row.partId;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {priceFlag && canApplyPrices && partId ? (
        correction?.canApply ? (
          <Button disabled={isPending} onClick={() => onApply(partId)} size="sm" type="button">
            {isPending ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
            Apply — average to {formatCurrency(correction.newAverageUnitCost ?? 0, 'ZAR')}
          </Button>
        ) : (
          // The stock this arrived as has already been drawn and its Job costs are stamped, so
          // there is no honest revaluation left to post (spec §5).
          <span className="text-xs text-muted-foreground">Stock already consumed; note only</span>
        )
      ) : null}
      {open.map((flag) => (
        <Button
          disabled={isPending}
          key={flag.key}
          onClick={() => onDismiss(flag.key)}
          size="sm"
          type="button"
          variant="ghost"
        >
          Dismiss {INVOICE_MATCH_FLAG_LABELS[flag.kind].toLowerCase()}
        </Button>
      ))}
    </div>
  );
}

function FlagBadge({ flag, resolution }: { flag: InvoiceMatchFlag; resolution: 'applied' | 'dismissed' | null }) {
  if (resolution) {
    return (
      <Badge variant="outline">
        {INVOICE_MATCH_FLAG_LABELS[flag.kind]} · {resolution === 'applied' ? 'applied' : 'dismissed'}
      </Badge>
    );
  }

  return <Badge variant="destructive">{INVOICE_MATCH_FLAG_LABELS[flag.kind]}</Badge>;
}

function summary(invoice: SupplierInvoiceReview, outstanding: number): string {
  if (!invoice.readable) return "Couldn't read this invoice";

  const matched = invoice.rows.filter((row) => row.matchMethod !== 'none').length;

  return `${matched} matched · ${outstanding} ${outstanding === 1 ? 'flag' : 'flags'} to judge`;
}

function quantityPair(row: SupplierInvoiceMatchRow): string {
  return `${row.orderedQuantity === null ? '—' : formatNumber(row.orderedQuantity)} / ${
    row.invoiceQuantity === null ? '—' : formatNumber(row.invoiceQuantity)
  }`;
}

function pricePair(row: SupplierInvoiceMatchRow): string {
  return `${row.unitPrice === null ? '—' : formatCurrency(row.unitPrice, 'ZAR')} / ${
    row.invoiceUnitPrice === null ? '—' : formatCurrency(row.invoiceUnitPrice, 'ZAR')
  }`;
}
