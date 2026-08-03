import type { JobStockRow } from '@pkg/schema';

import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatLengthBucket, formatPartQuantity } from '@/utils/part-quantity-format.js';

/** `onReturn` turns each drawn row into a leftover the close-out screen can hand straight back. */
export function JobStockTable({
  items,
  onReturn,
}: {
  items: readonly JobStockRow[];
  onReturn?: ((partId: string) => void) | undefined;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead>CFO</TableHead>
          <TableHead>Drawn</TableHead>
          <TableHead>Committed</TableHead>
          {onReturn ? <TableHead className="sr-only">Return</TableHead> : null}
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
            {onReturn ? (
              <TableCell className="text-right">
                {item.drawnQuantity > 0 ? (
                  <Button onClick={() => onReturn(item.partId)} size="sm" variant="outline">
                    Return
                  </Button>
                ) : null}
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
