import { formatNumber } from '@pkg/domain';
import type { JobStockRow } from '@pkg/schema';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatPartQuantity } from '@/utils/part-quantity-format.js';

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
            <TableCell className="tabular-nums">{formatJobQuantity(item.cfoQuantity, item)}</TableCell>
            <TableCell className="tabular-nums">
              <span className="block">{formatJobQuantity(item.drawnQuantity, item)}</span>
              {item.lengthBuckets.map((bucket) => (
                <span key={bucket.lengthMm} className="block text-muted-foreground text-xs">
                  {formatNumber(bucket.lengthMm / 1_000, {
                    decimals: bucket.lengthMm % 1_000 === 0 ? 0 : 1,
                  })}{' '}
                  m × {formatNumber(bucket.drawnQuantity, { decimals: 0 })}
                </span>
              ))}
            </TableCell>
            <TableCell className="tabular-nums">{formatJobQuantity(item.committedQuantity, item)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatJobQuantity(quantity: number, item: Pick<JobStockRow, 'unitOfMeasure'>): string {
  return item.unitOfMeasure === 'mm'
    ? `${formatNumber(quantity, { decimals: 0 })} pieces`
    : formatPartQuantity(quantity, item.unitOfMeasure);
}
