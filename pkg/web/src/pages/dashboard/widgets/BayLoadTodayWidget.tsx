import type React from 'react';

import { computeBayLoadToday } from '../bay-schedule-derivations.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

export const BayLoadTodayWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load bay load." />;
  }

  if (bays.status === 'pending') {
    return <StatCardSkeleton />;
  }

  if (bays.enabledBays.length === 0) {
    return <DashboardWidgetEmpty>No enabled Bays.</DashboardWidgetEmpty>;
  }

  const load = computeBayLoadToday({ bays: bays.enabledBays, offDays: bays.offDays, today: bays.today });

  return <StatCard sublabel={`${load.idleCount} idle · ${load.offCount} off`} value={`${load.loadPercent}%`} />;
};
