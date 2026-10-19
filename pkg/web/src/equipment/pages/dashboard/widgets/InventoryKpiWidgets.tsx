import { formatCurrency, formatNumber } from '@pkg/domain';
import type { InventoryKpis } from '@pkg/schema/equipment';
import { STOCK_ADJUSTMENT_REASON_LABELS } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type React from 'react';
import { DashboardTile } from '@/components/common/dashboard/DashboardTile.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { StatCardSkeleton } from '@/components/common/StatCard.js';
import { useTRPC } from '@/lib/trpc.js';

const INVENTORY_KPI_LINK_CLASS_NAME = 'flex flex-1 hover:underline';

export const InventoryValueWidget: React.FC = () => {
  const query = useInventoryKpis();

  return (
    <DashboardTile
      value={query.data ? formatValue(query.data.inventoryValue) : undefined}
      error={query.error}
      errorMessage={INVENTORY_KPI_ERROR_MESSAGE}
      sublabel={
        query.data
          ? query.data.inventoryValue === null
            ? 'Uncosted stock prevents a complete valuation'
            : 'Negative stock balances subtract from value'
          : undefined
      }
      link={inventoryLink}
    />
  );
};

export const InventoryTurnsWidget: React.FC = () => {
  const query = useInventoryKpis();

  return (
    <DashboardTile
      value={
        query.data
          ? query.data.inventoryTurns === null
            ? '—'
            : `${formatNumber(query.data.inventoryTurns, { decimals: 2 })}×`
          : undefined
      }
      error={query.error}
      errorMessage={INVENTORY_KPI_ERROR_MESSAGE}
      sublabel="Annualized, trailing 90d, perpetual stock"
      link={inventoryLink}
    />
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

const INVENTORY_KPI_ERROR_MESSAGE = 'Unable to load inventory KPIs.';

function useInventoryKpis() {
  const trpc = useTRPC();
  // All four registry entries share this key, so React Query keeps the dashboard to one server read.
  return useQuery(trpc.inventory.inventoryKpis.queryOptions());
}

function inventoryLink(body: React.ReactNode) {
  return (
    <Link className={INVENTORY_KPI_LINK_CLASS_NAME} to="/equipment/inventory">
      {body}
    </Link>
  );
}

/** The two list-shaped KPIs are not tiles, so they keep their own loading cascade around the shared query. */
function InventoryKpiQuery({ children }: { children: (data: InventoryKpis) => React.ReactNode }) {
  const query = useInventoryKpis();

  if (query.error) {
    return <DashboardWidgetError error={query.error} fallbackMessage={INVENTORY_KPI_ERROR_MESSAGE} />;
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
    <Link className="flex flex-1 flex-col gap-3 hover:underline" to="/equipment/inventory">
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
  return value === null ? 'No cost yet' : formatCurrency(value);
}
