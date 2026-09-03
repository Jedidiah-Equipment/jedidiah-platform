import { formatCurrency, formatDate, formatNumber } from '@pkg/domain';
import type { UUID } from '@pkg/schema';
import {
  type PartUnitOfMeasure,
  STOCK_ADJUSTMENT_REASON_LABELS,
  STOCK_RETURN_TO_SUPPLIER_REASON_LABELS,
  STOCKTAKE_SCOPE_LABELS,
  type StockMovementHistoryRow,
  type StockMovementReason,
  type StockReturnToSupplierReason,
} from '@pkg/schema';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { formatUnitCost, getPartQuantityUnitDisplay } from '@/equipment/utils/part-quantity-format.js';

type MovementReference = { id: UUID; kind: 'job' | 'purchase-order' | 'stocktake'; label: string };

/**
 * What a movement points back at. A ledger row is never posted in a vacuum — stock arrives on an
 * order, is drawn to a Job, or is corrected by a stocktake walk — and each of those is a page the
 * reader can open to see why the number moved. A movement with no reference of its own (a
 * hand-posted adjustment, a revaluation) genuinely has none; its note carries the reason instead.
 */
function movementReference(item: StockMovementHistoryRow): MovementReference | null {
  if (item.purchaseOrderId && item.purchaseOrderCode) {
    return { id: item.purchaseOrderId, kind: 'purchase-order', label: item.purchaseOrderCode };
  }

  if (item.jobId && item.jobCode) {
    return { id: item.jobId, kind: 'job', label: item.jobCode };
  }

  if (item.stocktakeSessionId && item.stocktakeSessionScope) {
    return {
      id: item.stocktakeSessionId,
      kind: 'stocktake',
      label: `${STOCKTAKE_SCOPE_LABELS[item.stocktakeSessionScope]} count`,
    };
  }

  return null;
}

const REFERENCE_LINK_CLASS = 'font-medium underline-offset-4 hover:underline';

function MovementReferenceCell({ canReadJobs, item }: { canReadJobs: boolean; item: StockMovementHistoryRow }) {
  const reference = movementReference(item);
  if (!reference) return '—';

  // A reference nobody may open is still worth naming; it just stops pretending to be a way there.
  if (reference.kind === 'job' && !canReadJobs) return reference.label;

  if (reference.kind === 'purchase-order') {
    return (
      <Link className={REFERENCE_LINK_CLASS} params={{ id: reference.id }} to="/equipment/purchase-orders/$id">
        {reference.label}
      </Link>
    );
  }

  if (reference.kind === 'job') {
    return (
      <Link className={REFERENCE_LINK_CLASS} params={{ id: reference.id }} to="/equipment/jobs/$id">
        {reference.label}
      </Link>
    );
  }

  return (
    <Link
      className={REFERENCE_LINK_CLASS}
      params={{ sessionId: reference.id }}
      to="/equipment/inventory/stocktake/$sessionId"
    >
      {reference.label}
    </Link>
  );
}

export function StockMovementHistoryTable({
  canReadJobs,
  items,
  showCosts,
  unitOfMeasure,
}: {
  canReadJobs: boolean;
  items: readonly StockMovementHistoryRow[];
  showCosts: boolean;
  unitOfMeasure: PartUnitOfMeasure;
}) {
  const columns = useMemo(
    () => createStockMovementHistoryColumns({ canReadJobs, showCosts, unitOfMeasure }),
    [canReadJobs, showCosts, unitOfMeasure],
  );
  const data = useMemo(() => [...items], [items]);
  const table = useDataTable({
    columns,
    data,
    enableColumnFilters: false,
    enableSortingRemoval: false,
  });
  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No stock movements have been recorded for this Part."
      globalFilterPlaceholder="Search inventory history..."
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'movement' : 'movements'}`}
    />
  );
}

function createStockMovementHistoryColumns({
  canReadJobs,
  showCosts,
  unitOfMeasure,
}: {
  canReadJobs: boolean;
  showCosts: boolean;
  unitOfMeasure: PartUnitOfMeasure;
}): DataTableColumnDef<StockMovementHistoryRow>[] {
  return [
    {
      accessorKey: 'createdAt',
      cell: ({ row }) => formatDate(row.original.createdAt, 'medium'),
      header: 'When',
    },
    {
      accessorFn: formatMovementLabel,
      header: 'Movement',
      id: 'movement',
    },
    {
      accessorFn: (item) => (item.movementType === 'revaluation' ? 0 : item.delta),
      cell: ({ row }) => formatMovementQuantity(row.original, unitOfMeasure),
      header: 'Quantity',
      id: 'quantity',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorKey: 'runningBalance',
      cell: ({ row }) => formatLedgerQuantity(row.original.runningBalance, unitOfMeasure),
      header: 'Running balance',
      meta: { cellClassName: 'tabular-nums' },
    },
    {
      accessorFn: (item) => item.note ?? '—',
      header: 'Note',
      id: 'note',
    },
    {
      accessorKey: 'actorName',
      header: 'Actor',
    },
    {
      accessorFn: (item) => movementReference(item)?.label ?? '—',
      cell: ({ row }) => <MovementReferenceCell canReadJobs={canReadJobs} item={row.original} />,
      header: 'Reference',
      id: 'reference',
    },
    ...(showCosts
      ? [
          {
            accessorKey: 'unitCost',
            cell: ({ row }) => formatMovementUnitCost(row.original.unitCost, unitOfMeasure),
            header: 'Unit cost',
          } satisfies DataTableColumnDef<StockMovementHistoryRow>,
          {
            accessorKey: 'movementValue',
            cell: ({ row }) => formatCost(row.original.movementValue),
            header: 'Movement value',
          } satisfies DataTableColumnDef<StockMovementHistoryRow>,
        ]
      : []),
  ];
}

function formatMovementLabel(item: StockMovementHistoryRow): string {
  switch (item.movementType) {
    case 'checkout':
      return 'Checkout';
    case 'return-to-store':
      return 'Return to store';
    case 'receipt':
      return 'Receipt';
    case 'return-to-supplier':
      return item.reason === null || !isReturnToSupplierReason(item.reason)
        ? 'Return to Supplier'
        : `Return to Supplier — ${STOCK_RETURN_TO_SUPPLIER_REASON_LABELS[item.reason]}`;
    case 'build-consume':
      return 'Build consumption';
    case 'build-produce':
      return 'Build output';
    case 'revaluation':
      return 'Revaluation';
    case 'adjustment':
      return item.reason === null || isReturnToSupplierReason(item.reason)
        ? 'Adjustment'
        : STOCK_ADJUSTMENT_REASON_LABELS[item.reason];
  }
}

/** One column carries both reason sets, so each label lookup has to say which set it is reading. */
function isReturnToSupplierReason(reason: StockMovementReason): reason is StockReturnToSupplierReason {
  return reason in STOCK_RETURN_TO_SUPPLIER_REASON_LABELS;
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

/** A revaluation stamps a linear Part's per-millimetre average verbatim, so this column holds sub-cent
 * figures the way Stock on hand does — rounded to two decimals the row stops matching the average it set. */
function formatMovementUnitCost(value: number | null, unitOfMeasure: PartUnitOfMeasure): string {
  return value === null ? '—' : formatUnitCost(value, unitOfMeasure);
}
