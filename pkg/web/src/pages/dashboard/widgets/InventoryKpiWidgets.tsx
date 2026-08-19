import { formatCurrency } from '@pkg/domain';
import type { InventoryKpis } from '@pkg/schema';
import { STOCK_ADJUSTMENT_REASON_LABELS } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const InventoryValueWidget: React.FC = () => {
  return (
    <InventoryKpiQuery>
      {(data) => (
        <Link className="flex flex-1 hover:underline" to="/inventory">
          <StatCard
            sublabel={
              data.inventoryValue === null
                ? 'Uncosted stock prevents a complete valuation'
                : 'Negative stock balances subtract from value'
            }
            value={formatValue(data.inventoryValue)}
          />
        </Link>
      )}
    </InventoryKpiQuery>
  );
};

export const InventoryTurnsWidget: React.FC = () => {
  return (
    <InventoryKpiQuery>
      {(data) => (
        <Link className="flex flex-1 hover:underline" to="/inventory">
          <StatCard
            sublabel="Annualized, trailing 90d, perpetual stock"
            value={data.inventoryTurns === null ? '—' : `${data.inventoryTurns.toFixed(2)}×`}
          />
        </Link>
      )}
    </InventoryKpiQuery>
  );
};

export const TopInventoryAdjustmentsWidget: React.FC = () => {
  return (
    <InventoryKpiQuery>
      {(data) => (
        <KpiListLink emptyLabel="No adjustments this month" hasItems={data.adjustments.length > 0}>
          {data.adjustments.map((adjustment) => (
            <KpiListRow
              key={adjustment.reason}
              label={STOCK_ADJUSTMENT_REASON_LABELS[adjustment.reason]}
              value={adjustment.value}
            />
          ))}
        </KpiListLink>
      )}
    </InventoryKpiQuery>
  );
};

export const TopScrapItemsWidget: React.FC = () => {
  return (
    <InventoryKpiQuery>
      {(data) => (
        <KpiListLink emptyLabel="No scrap adjustments this month" hasItems={data.scrapItems.length > 0}>
          {data.scrapItems.map((item) => (
            <KpiListRow key={item.partId} label={`${item.partName} · ${item.partCode}`} value={item.value} />
          ))}
        </KpiListLink>
      )}
    </InventoryKpiQuery>
  );
};

function InventoryKpiQuery({ children }: { children: (data: InventoryKpis) => React.ReactNode }) {
  const trpc = useTRPC();
  // All four registry entries share this key, so React Query keeps the dashboard to one server read.
  const query = useQuery(trpc.inventory.inventoryKpis.queryOptions());

  if (query.error) {
    return <DashboardWidgetError error={query.error} fallbackMessage="Unable to load inventory KPIs." />;
  }
  if (query.isPending) return <StatCardSkeleton />;

  return children(query.data);
}

function KpiListLink({
  children,
  emptyLabel,
  hasItems,
}: {
  children: React.ReactNode;
  emptyLabel: string;
  hasItems: boolean;
}) {
  return (
    <Link className="flex flex-1 flex-col gap-3 hover:underline" to="/inventory">
      {hasItems ? (
        <div className="flex flex-col gap-2">{children}</div>
      ) : (
        <DashboardWidgetEmpty>{emptyLabel}</DashboardWidgetEmpty>
      )}
      <span className="mt-auto text-muted-foreground text-xs">Current moving-average estimate</span>
    </Link>
  );
}

function KpiListRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="line-clamp-1">{label}</span>
      <span className="shrink-0 font-medium tabular-nums">{formatValue(value)}</span>
    </div>
  );
}

function formatValue(value: number | null): string {
  return value === null ? 'No cost yet' : formatCurrency(value, 'ZAR');
}
