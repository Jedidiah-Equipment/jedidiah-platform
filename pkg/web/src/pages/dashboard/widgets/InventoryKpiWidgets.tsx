import { formatCurrency } from '@pkg/domain';
import { STOCK_ADJUSTMENT_REASON_LABELS } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const InventoryValueWidget: React.FC = () => {
  const query = useInventoryKpis();

  if (query.error) return <KpiError error={query.error} />;
  if (query.isPending) return <StatCardSkeleton />;

  return (
    <Link className="flex flex-1 hover:underline" to="/inventory">
      <StatCard
        sublabel={
          query.data.inventoryValue === null
            ? 'Uncosted stock prevents a complete valuation'
            : 'Negative stock balances subtract from value'
        }
        value={formatValue(query.data.inventoryValue)}
      />
    </Link>
  );
};

export const InventoryTurnsWidget: React.FC = () => {
  const query = useInventoryKpis();

  if (query.error) return <KpiError error={query.error} />;
  if (query.isPending) return <StatCardSkeleton />;

  return (
    <Link className="flex flex-1 hover:underline" to="/inventory">
      <StatCard
        sublabel="Annualized, trailing 90d, perpetual stock"
        value={query.data.inventoryTurns === null ? '—' : `${query.data.inventoryTurns.toFixed(2)}×`}
      />
    </Link>
  );
};

export const TopInventoryAdjustmentsWidget: React.FC = () => {
  const query = useInventoryKpis();

  if (query.error) return <KpiError error={query.error} />;
  if (query.isPending) return <StatCardSkeleton />;

  return (
    <KpiListLink emptyLabel="No adjustments this month">
      {query.data.adjustments.map((adjustment) => (
        <KpiListRow
          key={adjustment.reason}
          label={STOCK_ADJUSTMENT_REASON_LABELS[adjustment.reason]}
          value={adjustment.value}
        />
      ))}
    </KpiListLink>
  );
};

export const TopScrapItemsWidget: React.FC = () => {
  const query = useInventoryKpis();

  if (query.error) return <KpiError error={query.error} />;
  if (query.isPending) return <StatCardSkeleton />;

  return (
    <KpiListLink emptyLabel="No scrap adjustments this month">
      {query.data.scrapItems.map((item) => (
        <KpiListRow key={item.partId} label={`${item.partName} · ${item.partCode}`} value={item.value} />
      ))}
    </KpiListLink>
  );
};

function useInventoryKpis() {
  const trpc = useTRPC();

  // All four registry entries share this key, so React Query keeps the dashboard to one server read.
  return useQuery(trpc.inventory.inventoryKpis.queryOptions());
}

function KpiError({ error }: { error: unknown }) {
  return <DashboardWidgetError error={error} fallbackMessage="Unable to load inventory KPIs." />;
}

function KpiListLink({ children, emptyLabel }: { children: React.ReactNode; emptyLabel: string }) {
  const hasItems = Array.isArray(children) && children.length > 0;

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
