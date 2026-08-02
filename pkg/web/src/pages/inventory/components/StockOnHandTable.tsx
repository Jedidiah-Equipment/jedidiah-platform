import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import type { StockOnHandRow, UUID } from '@pkg/schema';

import { Button } from '@/components/ui/button.js';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { formatPartQuantity, getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';

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
          <TableHead>Count status</TableHead>
          {showCosts ? <TableHead>Average cost</TableHead> : null}
          {showCosts ? <TableHead>Value</TableHead> : null}
          <TableHead className="text-right">History</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={`${item.partId}:${item.lengthMm ?? 'unbucketed'}`}>
            <TableCell>
              <span className="block font-medium">{item.partName}</span>
              <span className="block text-muted-foreground text-xs">{item.partCode}</span>
            </TableCell>
            <TableCell className="tabular-nums">{formatStockOnHand(item)}</TableCell>
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

function formatStockOnHand(item: StockOnHandRow): string {
  if (item.unitOfMeasure === 'mm' && item.lengthMm !== null) {
    return `${formatNumber(item.lengthMm / 1_000, { decimals: item.lengthMm % 1_000 === 0 ? 0 : 1 })} m × ${formatNumber(item.quantity, { decimals: 0 })}`;
  }

  return formatPartQuantity(item.quantity, item.unitOfMeasure);
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

  const suffix = item.unitOfMeasure === 'mm' ? 'mm' : getPartQuantityUnitDisplay(item.unitOfMeasure).suffix;
  return `${formatCurrency(item.averageUnitCost, 'ZAR')}/${suffix}`;
}

function formatInventoryValue(value: number | null): string {
  return value === null ? 'No cost yet' : formatCurrency(value, 'ZAR');
}
