import { formatCurrency, formatDate } from '@pkg/domain';
import type { StockOnHandRow, UUID } from '@pkg/schema';

import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatLengthBucket, formatPartQuantity, getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';

export function StockOnHandTable({
  items,
  onOpenHistory,
  showCosts,
}: {
  items: readonly StockOnHandRow[];
  onOpenHistory: (partId: UUID) => void;
  showCosts: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Part</TableHead>
          <TableHead>Stock on hand</TableHead>
          <TableHead>Free</TableHead>
          <TableHead>Count status</TableHead>
          {showCosts ? <TableHead>Average cost</TableHead> : null}
          {showCosts ? <TableHead>Value</TableHead> : null}
          <TableHead className="text-right">History</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.partId}>
            <TableCell>
              <span className="block font-medium">{item.partName}</span>
              <span className="block text-muted-foreground text-xs">{item.partCode}</span>
            </TableCell>
            <TableCell className="tabular-nums">
              <span className="block">{formatPartQuantity(item.quantity, item.unitOfMeasure)}</span>
              {item.buckets.map((bucket) =>
                bucket.lengthMm === null ? null : (
                  <span key={bucket.lengthMm} className="block text-muted-foreground text-xs">
                    {formatLengthBucket(bucket.lengthMm, bucket.quantity)}
                  </span>
                ),
              )}
            </TableCell>
            <TableCell className="tabular-nums">{formatPartQuantity(item.free, item.unitOfMeasure)}</TableCell>
            <TableCell>{formatCountStatus(item)}</TableCell>
            {showCosts ? <TableCell>{formatAverageCost(item)}</TableCell> : null}
            {showCosts ? <TableCell>{formatInventoryValue(item.totalValue)}</TableCell> : null}
            <TableCell className="text-right">
              <Button onClick={() => onOpenHistory(item.partId)} size="sm" variant="link">
                View history
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatCountStatus(item: StockOnHandRow): string {
  if (item.stockTrackingMode !== 'periodic') {
    return 'Live';
  }

  return item.asOfLastCount === null
    ? 'No count yet'
    : `As of last count ${formatDate(item.asOfLastCount, 'd MMM yyyy')}`;
}

function formatAverageCost(item: StockOnHandRow): string {
  if (item.averageUnitCost === null) {
    return 'No cost yet';
  }

  // A linear Part's average is per millimetre, so its suffix is the dimension, not the counting unit.
  return `${formatCurrency(item.averageUnitCost, 'ZAR')}/${getPartQuantityUnitDisplay(item.unitOfMeasure).suffix}`;
}

function formatInventoryValue(value: number | null): string {
  return value === null ? 'No cost yet' : formatCurrency(value, 'ZAR');
}
