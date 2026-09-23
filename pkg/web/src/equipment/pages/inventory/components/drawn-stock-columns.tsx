import type { JobStockRow } from '@pkg/schema/equipment';

import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { formatLengthBucket, formatPartQuantity } from '@/equipment/utils/part-quantity-format.js';

/** What a Job or Parts Sale stock row carries for the Part and Drawn columns both screens show. */
type DrawnStockRow = Pick<JobStockRow, 'drawnQuantity' | 'lengthBuckets' | 'partCode' | 'partName' | 'unitOfMeasure'>;

export function partColumn<TRow extends DrawnStockRow>(): DataTableColumnDef<TRow> {
  return {
    accessorFn: (item) => `${item.partName} ${item.partCode}`,
    cell: ({ row }) => (
      <>
        <span className="block font-medium">{row.original.partName}</span>
        <span className="block text-muted-foreground text-xs">{row.original.partCode}</span>
      </>
    ),
    header: 'Part',
    id: 'part',
  };
}

/** Net drawn for the Part, with each length bucket still out beneath it. */
export function drawnColumn<TRow extends DrawnStockRow>(): DataTableColumnDef<TRow> {
  return {
    accessorFn: (item) => item.drawnQuantity,
    cell: ({ row }) => (
      <>
        <span className="block">{formatPartQuantity(row.original.drawnQuantity, row.original.unitOfMeasure)}</span>
        {row.original.lengthBuckets.map((bucket) => (
          <span key={bucket.lengthMm} className="block text-muted-foreground text-xs">
            {formatLengthBucket(bucket.lengthMm, bucket.drawnQuantity)}
          </span>
        ))}
      </>
    ),
    header: 'Drawn',
    id: 'drawnQuantity',
    meta: {
      cellClassName: 'tabular-nums',
    },
  };
}
