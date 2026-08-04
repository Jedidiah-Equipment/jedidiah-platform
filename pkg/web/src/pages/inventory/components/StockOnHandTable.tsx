import { formatCurrency, formatDate } from '@pkg/domain';
import type { StockOnHandRow, UUID } from '@pkg/schema';
import { IconAlertTriangle } from '@tabler/icons-react';

import { Badge } from '@/components/ui/badge.js';
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
              <StockQuantity className="block" quantity={item.quantity}>
                {formatPartQuantity(item.quantity, item.unitOfMeasure)}
              </StockQuantity>
              {item.buckets.map((bucket) =>
                bucket.lengthMm === null ? null : (
                  <StockQuantity
                    key={bucket.lengthMm}
                    className="block text-muted-foreground text-xs"
                    quantity={bucket.quantity}
                  >
                    {formatLengthBucket(bucket.lengthMm, bucket.quantity)}
                  </StockQuantity>
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

/**
 * A negative count is an operational exception, not a smaller number: it means the shelf disagrees
 * with the ledger, and plain table text disappears in a long list. Free stock is deliberately not
 * routed through here — spec §3 sends negative free to procurement's buy list and reserves the
 * count-is-wrong flag for negative stock on hand.
 */
function StockQuantity({ children, className, quantity }: { children: string; className?: string; quantity: number }) {
  if (quantity >= 0) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={className}>
      <Badge variant="destructive">
        <IconAlertTriangle data-icon="inline-start" />
        {children}
        <span className="sr-only">Negative stock</span>
      </Badge>
    </span>
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
