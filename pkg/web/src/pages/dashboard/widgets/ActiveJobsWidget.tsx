import type React from 'react';

import { countActiveJobs } from '../bay-schedule-derivations.js';
import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

export const ActiveJobsWidget: React.FC = () => {
  const bays = useShopFloorBays();

  if (bays.status === 'error') {
    return <DashboardWidgetError error={bays.error} fallbackMessage="Unable to load active jobs." />;
  }

  if (bays.status === 'pending') {
    return <StatCardSkeleton />;
  }

  const { activeJobs, finishingThisWeek } = countActiveJobs({ bays: bays.enabledBays, today: bays.today });

  return <StatCard sublabel={`${finishingThisWeek} finishing this week`} value={activeJobs} />;
};
