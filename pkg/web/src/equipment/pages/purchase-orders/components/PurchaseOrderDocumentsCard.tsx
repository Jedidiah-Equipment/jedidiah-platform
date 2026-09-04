import { formatBytes, formatDate } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import { PURCHASE_ORDER_DOCUMENT_TYPE_LABELS, type PurchaseOrderDocumentRow } from '@pkg/schema/equipment';
import { IconEye } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.js';
import { DocumentPreviewSheet } from '@/equipment/components/documents/DocumentPreviewSheet.js';
import { useFilePreview } from '@/equipment/components/documents/use-file-preview.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * The order's whole paper trail: the as-sent PDF, every revision an amendment filed after it, and
 * the credit notes and Supplier invoices filed against it. Documents are immutable, so this is a
 * history rather than a folder — the newest revision is the one to send, and the older ones are
 * what was agreed before.
 */
export function PurchaseOrderDocumentsCard({
  canReadCosts,
  purchaseOrderId,
}: {
  canReadCosts: boolean;
  purchaseOrderId: UUID;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.purchaseOrders.documents.queryOptions({ purchaseOrderId }));
  const items = query.data?.items ?? [];
  const preview = useFilePreview<PurchaseOrderDocumentRow>();
  const columns = useMemo<DataTableColumnDef<PurchaseOrderDocumentRow>[]>(
    () => [
      {
        cell: ({ row }) => (
          <>
            <span className="font-medium">{row.original.filename}</span>
            {row.original.revision !== null && row.original.revision > 1 ? (
              <span className="text-muted-foreground"> · revision {row.original.revision}</span>
            ) : null}
          </>
        ),
        header: 'Document',
        id: 'filename',
      },
      {
        cell: ({ row }) => <Badge variant="outline">{PURCHASE_ORDER_DOCUMENT_TYPE_LABELS[row.original.type]}</Badge>,
        header: 'Type',
        id: 'type',
      },
      {
        accessorKey: 'createdAt',
        cell: ({ row }) => formatDate(row.original.createdAt, 'medium'),
        header: 'Filed',
      },
      {
        accessorFn: (document) => document.uploaderName ?? '—',
        header: 'By',
        id: 'uploader',
      },
      {
        accessorFn: (document) => formatBytes(document.byteSize),
        header: 'Size',
        id: 'size',
        meta: { cellClassName: 'text-right tabular-nums', headerClassName: 'text-right' },
      },
      // Every document here is priced — the order PDF prints line prices and a credit note is a
      // money document — and the download route refuses both without cost access. Offering the
      // button to a price-blind reader would only ever produce a 403.
      ...(canReadCosts
        ? [
            {
              cell: ({ row }) => (
                <div className="flex justify-end">
                  <Button
                    aria-label={`Preview ${row.original.filename}`}
                    onClick={() => preview.open(row.original)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <IconEye data-icon="inline-start" /> Preview
                  </Button>
                </div>
              ),
              enableSorting: false,
              header: () => <span className="sr-only">Preview</span>,
              id: 'preview',
            } satisfies DataTableColumnDef<PurchaseOrderDocumentRow>,
          ]
        : []),
    ],
    [canReadCosts, preview.open],
  );
  const table = useDataTable({
    columns,
    data: items,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (document) => document.id,
  });

  if (items.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
          <CardDescription>Every revision of this order, and the paperwork filed against it.</CardDescription>
        </CardHeader>
        <CardContent>
          <DataTable
            emptyMessage="No documents filed."
            hideGlobalFilter
            paginationMode="complete"
            table={table}
            total={items.length}
            totalLabel={(value) => `${value} ${value === 1 ? 'document' : 'documents'}`}
          />
        </CardContent>
      </Card>
      <DocumentPreviewSheet
        document={preview.file}
        onOpenChange={preview.onOpenChange}
        open={preview.isOpen}
        owner={{ id: purchaseOrderId, type: 'purchase_order' }}
      />
    </>
  );
}
