import { formatCurrency } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { DashboardWidgetError } from '@/components/common/dashboard/DashboardWidgetCard.js';
import { StatCard, StatCardSkeleton } from '@/components/common/StatCard.js';
import { useTRPC } from '@/lib/trpc.js';

export const OpenPipelineWidget: React.FC = () => {
  const trpc = useTRPC();
  const pipelineQuery = useQuery(trpc.quotes.pipelineSummary.queryOptions());

  if (pipelineQuery.error) {
    return <DashboardWidgetError error={pipelineQuery.error} fallbackMessage="Unable to load the open pipeline." />;
  }

  if (pipelineQuery.isPending) {
    return <StatCardSkeleton />;
  }

  const { newlySent30dValue, openPipelineCount, openPipelineValue } = pipelineQuery.data;

  return (
    <StatCard
      sublabel={`${formatCurrency(newlySent30dValue)} newly sent in last 30d · ${openPipelineCount} open`}
      value={formatCurrency(openPipelineValue)}
    />
  );
};
