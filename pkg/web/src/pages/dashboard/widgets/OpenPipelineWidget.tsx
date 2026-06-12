import { formatCurrency } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { useTRPC } from '@/lib/trpc.js';

import { DashboardWidgetError } from '../DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '../StatCard.js';

export const OpenPipelineWidget: React.FC = () => {
  const trpc = useTRPC();
  const pipelineQuery = useQuery(trpc.quotes.pipelineSummary.queryOptions());

  if (pipelineQuery.error) {
    return <DashboardWidgetError error={pipelineQuery.error} fallbackMessage="Unable to load the open pipeline." />;
  }

  if (pipelineQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const { newlySent30dValue, openSentCount, openSentValue } = pipelineQuery.data;

  return (
    <StatCard
      sublabel={`${formatCurrency(newlySent30dValue, 'ZAR')} newly sent in last 30d · ${openSentCount} open`}
      value={formatCurrency(openSentValue, 'ZAR')}
    />
  );
};
