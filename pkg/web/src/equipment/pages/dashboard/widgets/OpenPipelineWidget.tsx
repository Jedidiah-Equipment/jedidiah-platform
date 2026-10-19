import { formatCurrency } from '@pkg/domain';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';
import { DashboardTile } from '@/components/common/dashboard/DashboardTile.js';
import { useTRPC } from '@/lib/trpc.js';

export const OpenPipelineWidget: React.FC = () => {
  const trpc = useTRPC();
  const pipelineQuery = useQuery(trpc.quotes.pipelineSummary.queryOptions());
  const pipeline = pipelineQuery.data;

  return (
    <DashboardTile
      value={pipeline ? formatCurrency(pipeline.openPipelineValue) : undefined}
      error={pipelineQuery.error}
      errorMessage="Unable to load the open pipeline."
      sublabel={
        pipeline
          ? `${formatCurrency(pipeline.newlySent30dValue)} newly sent in last 30d · ${pipeline.openPipelineCount} open`
          : undefined
      }
    />
  );
};
