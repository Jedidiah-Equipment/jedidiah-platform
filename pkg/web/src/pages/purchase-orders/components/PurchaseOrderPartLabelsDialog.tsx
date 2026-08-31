import { type PartLabelBatchSelection, PartLabelCount, type PurchaseOrderLineView } from '@pkg/schema';
import { IconPrinter } from '@tabler/icons-react';
import { useMemo, useState } from 'react';

import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
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
import { partLabelBatchUrl } from '../../parts/part-label.js';

type PartLabelRow = Pick<PurchaseOrderLineView, 'partCode' | 'partId' | 'partName' | 'receivedQuantity'> & {
  copies: number;
};

export function PurchaseOrderPartLabelsDialog({ lines }: { lines: PurchaseOrderLineView[] }) {
  const receivedLines = useMemo(() => lines.filter((line) => line.receivedQuantity > 0), [lines]);
  const [isOpen, setIsOpen] = useState(false);
  const [copiesByPartId, setCopiesByPartId] = useState<Record<string, number>>({});
  const rows = useMemo(
    () =>
      receivedLines.map((line) => ({
        ...line,
        copies: copiesByPartId[line.partId] ?? line.receivedQuantity,
      })),
    [copiesByPartId, receivedLines],
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
              min={0}
              onChange={(event) => {
                const value = event.target.value === '' ? Number.NaN : Number(event.target.value);
                setCopiesByPartId((current) => ({ ...current, [line.partId]: value }));
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
  const selection = toLabelSelection(rows);

  if (receivedLines.length === 0) return null;

  const openDialog = () => {
    setCopiesByPartId(Object.fromEntries(receivedLines.map((line) => [line.partId, line.receivedQuantity])));
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
            <DialogTitle>Print Part labels</DialogTitle>
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
          <p className="text-xs text-muted-foreground">Label counts must be whole numbers of zero or more.</p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
            {selection ? (
              <Button render={<a href={partLabelBatchUrl(selection)} rel="noreferrer" target="_blank" />}>
                <IconPrinter data-icon="inline-start" /> Open printable PDF
              </Button>
            ) : (
              <Button disabled>
                <IconPrinter data-icon="inline-start" /> Open printable PDF
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function toLabelSelection(rows: PartLabelRow[]): PartLabelBatchSelection | null {
  if (!rows.every((row) => isLabelCount(row.copies))) return null;

  const selected = rows.filter((row) => row.copies > 0);
  if (selected.length === 0) return null;

  return {
    copies: selected.map((row) => ({ copies: row.copies, partId: row.partId })),
    selection: 'ids',
  };
}

function isLabelCount(value: number): boolean {
  return PartLabelCount.safeParse(value).success;
}
