import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import { type PartUnitOfMeasure, STOCK_ADJUSTMENT_REASON_LABELS, type StockMovementHistoryRow } from '@pkg/schema';
import { Link } from '@tanstack/react-router';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.js';
import { getPartQuantityUnitDisplay } from '@/utils/part-quantity-format.js';

export function StockMovementHistoryTable({
  items,
  showCosts,
  unitOfMeasure,
}: {
  items: readonly StockMovementHistoryRow[];
  showCosts: boolean;
  unitOfMeasure: PartUnitOfMeasure;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Movement</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Running balance</TableHead>
          <TableHead>Note</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Reference</TableHead>
          {showCosts ? <TableHead>Unit cost</TableHead> : null}
          {showCosts ? <TableHead>Movement value</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>{formatDate(item.createdAt, 'medium')}</TableCell>
            <TableCell>{formatMovementLabel(item)}</TableCell>
            <TableCell className="tabular-nums">{formatMovementQuantity(item, unitOfMeasure)}</TableCell>
            <TableCell className="tabular-nums">{formatLedgerQuantity(item.runningBalance, unitOfMeasure)}</TableCell>
            <TableCell>{item.note ?? '—'}</TableCell>
            <TableCell>{item.actorName}</TableCell>
            <TableCell>
              {item.purchaseOrderId && item.purchaseOrderCode ? (
                <Link
                  className="font-medium underline-offset-4 hover:underline"
                  params={{ id: item.purchaseOrderId }}
                  to="/purchase-orders/$id"
                >
                  {item.purchaseOrderCode}
                </Link>
              ) : (
                '—'
              )}
            </TableCell>
            {showCosts ? <TableCell>{formatCost(item.unitCost)}</TableCell> : null}
            {showCosts ? <TableCell>{formatCost(item.movementValue)}</TableCell> : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function formatMovementLabel(item: StockMovementHistoryRow): string {
  switch (item.movementType) {
    case 'checkout':
      return 'Checkout';
    case 'return-to-store':
      return 'Return to store';
    case 'receipt':
      return 'Receipt';
    case 'build-consume':
      return 'Build consumption';
    case 'build-produce':
      return 'Build output';
    case 'revaluation':
      return 'Revaluation';
    case 'adjustment':
      return item.reason === null ? 'Adjustment' : STOCK_ADJUSTMENT_REASON_LABELS[item.reason];
  }
}

function formatMovementQuantity(item: StockMovementHistoryRow, unitOfMeasure: PartUnitOfMeasure): string {
  if (item.movementType === 'revaluation') {
    return '0';
  }

  if (unitOfMeasure === 'mm' && item.lengthMm !== null) {
    return `${formatNumber(item.delta)} pc @ ${formatNumber(item.lengthMm / 1_000, {
      decimals: item.lengthMm % 1_000 === 0 ? 0 : 1,
    })} m`;
  }

  return formatLedgerQuantity(item.delta, unitOfMeasure);
}

function formatLedgerQuantity(quantity: number, unitOfMeasure: PartUnitOfMeasure): string {
  const suffix = unitOfMeasure === 'mm' ? 'pc' : getPartQuantityUnitDisplay(unitOfMeasure).suffix;
  return `${formatNumber(quantity, { decimals: Number.isInteger(quantity) ? 0 : 3 })} ${suffix}`;
}

function formatCost(value: number | null): string {
  return value === null ? '—' : formatCurrency(value, 'ZAR');
}
