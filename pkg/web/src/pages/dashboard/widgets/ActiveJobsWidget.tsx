import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { countActiveJobs, listEnabledBays } from '../bay-schedule-derivations.js';
import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const ActiveJobsWidget: React.FC = () => {
  const trpc = useTRPC();
  const baysQuery = useQuery(trpc.jobs.listBays.queryOptions());

  if (baysQuery.error) {
    return <DashboardWidgetError error={baysQuery.error} fallbackMessage="Unable to load active jobs." />;
  }

  if (baysQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const { items, today } = baysQuery.data;
  const { activeJobs, finishingThisWeek } = countActiveJobs({ bays: listEnabledBays(items), today });

  return <StatCard sublabel={`${finishingThisWeek} finishing this week`} value={activeJobs} />;
};
