import { formatNumber } from '@pkg/domain';
import { countActiveJobs } from '@pkg/domain/equipment';
import type React from 'react';
import { DashboardTile } from '@/components/common/dashboard/DashboardTile.js';
import { useShopFloorBays } from '../use-shop-floor-bays.js';

export const ActiveJobsWidget: React.FC = () => {
  const bays = useShopFloorBays();
  const counts = bays.status === 'ready' ? countActiveJobs({ bays: bays.enabledBays, today: bays.today }) : undefined;

  return (
    <DashboardTile
      value={counts ? formatNumber(counts.activeJobs) : undefined}
      error={bays.status === 'error' ? bays.error : null}
      errorMessage="Unable to load active jobs."
      sublabel={counts ? `${counts.finishingThisWeek} finishing this week` : undefined}
    />
  );
};
