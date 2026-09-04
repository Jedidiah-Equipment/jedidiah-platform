import {
  PART_LABEL_BATCH_MAX_COPIES,
  PartLabelBatchSelection,
  PartLabelCount,
  type PurchaseOrderLineView,
} from '@pkg/schema/equipment';
import { IconPrinter } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { HelpLink } from '@/components/help/index.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { FilePreviewSheet } from '@/equipment/components/documents/FilePreviewSheet.js';
import { fetchPartLabelsBlob } from '@/equipment/pages/parts/part-label.js';
import { outstandingReceivedForLine } from './types.js';

type ReceivedPartLabelLine = Pick<PurchaseOrderLineView, 'partCode' | 'partId' | 'partName'> & {
  heldQuantity: number;
};

type PartLabelRow = ReceivedPartLabelLine & {
  copies: number;
};

export function PurchaseOrderPartLabelsDialog({ lines }: { lines: PurchaseOrderLineView[] }) {
  const receivedLines = useMemo(
    () =>
      lines
        .map((line) => ({
          heldQuantity: outstandingReceivedForLine(line),
          partCode: line.partCode,
          partId: line.partId,
          partName: line.partName,
        }))
        .filter((line) => line.heldQuantity > 0),
    [lines],
  );
  const [isOpen, setIsOpen] = useState(false);
  // Only the counts the user has edited; a missing entry falls back to the line's own default.
  const [copyOverrides, setCopyOverrides] = useState<Record<string, number>>({});
  // Snapshotted when the preview opens, so edits behind the sheet don't re-render its PDF.
  const [previewSelection, setPreviewSelection] = useState<PartLabelBatchSelection | null>(null);
  const rows = useMemo(
    () =>
      receivedLines.map((line) => ({
        ...line,
        copies: copyOverrides[line.partId] ?? defaultLabelCount(line.heldQuantity),
      })),
    [copyOverrides, receivedLines],
  );
  const columns = useMemo<DataTableColumnDef<PartLabelRow>[]>(
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
        accessorKey: 'copies',
        cell: ({ row }) => {
          const line = row.original;
          return (
            <Input
              aria-invalid={!isLabelCount(line.copies)}
              aria-label={`Labels for ${line.partCode}`}
              className="ml-auto w-24 text-right tabular-nums"
              inputMode="numeric"
              max={PART_LABEL_BATCH_MAX_COPIES}
              min={0}
              onChange={(event) => {
                const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
                setCopyOverrides((current) => ({ ...current, [line.partId]: value }));
              }}
              step={1}
              type="number"
              value={Number.isFinite(line.copies) ? line.copies : ''}
            />
          );
        },
        enableSorting: false,
        header: 'Labels',
        meta: { headerClassName: 'w-28 text-right' },
      },
    ],
    [],
  );
  const table = useDataTable({
    columns,
    data: rows,
    enableColumnFilters: false,
    enableSorting: false,
    getRowId: (line) => line.partId,
  });
  const selection = isOpen ? toLabelSelection(rows) : null;
  const fetchBlob = useCallback(
    ({ signal }: { signal: AbortSignal }) =>
      previewSelection
        ? fetchPartLabelsBlob({ selection: previewSelection, signal })
        : Promise.reject(new Error('No Part label selection to render.')),
    [previewSelection],
  );

  if (receivedLines.length === 0) return null;

  const openDialog = () => {
    setCopyOverrides({});
    setIsOpen(true);
  };

  return (
    <>
      <Button onClick={openDialog} type="button" variant="outline">
        <IconPrinter data-icon="inline-start" /> Print Part labels
      </Button>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Print Part labels
              <HelpLink label="How to print Part labels" topic="partLabels" />
            </DialogTitle>
            <DialogDescription>
              Choose how many labels to print for each Part received on this Purchase Order. Set a count to zero to
              leave that Part out.
            </DialogDescription>
          </DialogHeader>
          <DataTable
            emptyMessage="No received Parts."
            hideGlobalFilter
            paginationMode="complete"
            table={table}
            total={rows.length}
            totalLabel={(value) => `${value} received ${value === 1 ? 'Part' : 'Parts'}`}
          />
          <p className="text-xs text-muted-foreground">
            Label counts must be whole numbers. A PDF can contain up to {PART_LABEL_BATCH_MAX_COPIES.toLocaleString()}{' '}
            labels.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            <Button disabled={!selection} onClick={() => setPreviewSelection(selection)} type="button">
              <IconPrinter data-icon="inline-start" /> Open printable PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FilePreviewSheet
        description="Generated PDF"
        downloadFilename="part-labels.pdf"
        fetchBlob={fetchBlob}
        kind="pdf"
        onOpenChange={(open) => {
          if (!open) setPreviewSelection(null);
        }}
        open={previewSelection !== null}
        queryKey={['purchase-order-part-labels', previewSelection]}
        subject="Part labels"
        title="part-labels.pdf"
      />
    </>
  );
}

function toLabelSelection(rows: PartLabelRow[]): PartLabelBatchSelection | null {
  if (!rows.every((row) => isLabelCount(row.copies))) return null;

  const copies = rows.filter((row) => row.copies > 0).map((row) => ({ copies: row.copies, partId: row.partId }));
  if (copies.length === 0) return null;

  const parsed = PartLabelBatchSelection.safeParse({ copies, selection: 'copies' });
  return parsed.success ? parsed.data : null;
}

function isLabelCount(value: number): boolean {
  return PartLabelCount.safeParse(value).success;
}

function defaultLabelCount(heldQuantity: number): number {
  // A fraction describes measured stock, but a physical label count can only be whole.
  return Math.min(Math.ceil(heldQuantity), PART_LABEL_BATCH_MAX_COPIES);
}
