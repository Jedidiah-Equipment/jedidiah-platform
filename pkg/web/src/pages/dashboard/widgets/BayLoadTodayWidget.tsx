import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { computeBayLoadToday, listEnabledBays } from '../bay-schedule-derivations.js';
import { DashboardWidgetEmpty, DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const BayLoadTodayWidget: React.FC = () => {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());

  if (baysQuery.error) {
    return <DashboardWidgetError error={baysQuery.error} fallbackMessage="Unable to load bay load." />;
  }

  if (baysQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const { items, offDays, today } = baysQuery.data;
  const enabledBays = listEnabledBays(items);

  if (enabledBays.length === 0) {
    return <DashboardWidgetEmpty>No enabled Bays.</DashboardWidgetEmpty>;
  }

  const load = computeBayLoadToday({ bays: enabledBays, offDays, today });

  return <StatCard sublabel={`${load.idleCount} idle · ${load.offCount} off`} value={`${load.loadPercent}%`} />;
};
