import type { JobStockRow } from '@pkg/schema';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatLengthBucket, formatPartQuantity } from '@/utils/part-quantity-format.js';

export function JobStockTable({ items }: { items: readonly JobStockRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead>CFO</TableHead>
          <TableHead>Drawn</TableHead>
          <TableHead>Committed</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.partId}>
            <TableCell>
              <span className="block font-medium">{item.partName}</span>
              <span className="block text-muted-foreground text-xs">{item.partCode}</span>
            </TableCell>
            <TableCell className="tabular-nums">{formatPartQuantity(item.cfoQuantity, item.unitOfMeasure)}</TableCell>
            <TableCell className="tabular-nums">
              <span className="block">{formatPartQuantity(item.drawnQuantity, item.unitOfMeasure)}</span>
              {item.lengthBuckets.map((bucket) => (
                <span key={bucket.lengthMm} className="block text-muted-foreground text-xs">
                  {formatLengthBucket(bucket.lengthMm, bucket.drawnQuantity)}
                </span>
              ))}
            </TableCell>
            <TableCell className="tabular-nums">
              {formatPartQuantity(item.committedQuantity, item.unitOfMeasure)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
