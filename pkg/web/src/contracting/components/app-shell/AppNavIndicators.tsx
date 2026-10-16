import { formatNumber } from '@pkg/domain';
import { canSeeActivity } from '@pkg/domain/contracting';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { useActivityUnread } from '@/components/activity/use-activity-view.js';
import { NavWarningDot } from '@/components/app-shell/NavWarningDot.js';
import { useContractingActivityViewClient } from '@/contracting/components/activity/activity-view-client.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/pages/dashboard/dashboard-refresh.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

export const ReadingExceptionsNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const readingAccess = useCan('contracting_reading:update');
  const exceptionsQuery = useQuery({
    ...trpc.contractingReadings.listExceptions.queryOptions(),
    enabled: readingAccess.can,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  const count = exceptionsQuery.data?.length ?? 0;

  return count > 0 ? (
    <NavWarningDot
      label={`${formatNumber(count)} ${count === 1 ? 'reading exception needs' : 'reading exceptions need'} review`}
    />
  ) : null;
};

export const WorkshopNavIndicator: React.FC = () => {
  const trpc = useTRPC();
  const breakdownAccess = useCan('contracting_breakdown:read');
  const summaryQuery = useQuery({
    ...trpc.contractingBreakdowns.queueSummary.queryOptions(),
    enabled: breakdownAccess.can,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
  });
  const count = summaryQuery.data?.codeRedUnsolved ?? 0;

  return count > 0 ? (
    <NavWarningDot
      label={`${formatNumber(count)} Code Red ${count === 1 ? 'Breakdown' : 'Breakdowns'} not yet Fixed`}
    />
  ) : null;
};

/** The newest Activity item lies beyond this person's Contracting Activity View; opening Activity on All clears it. */
export const ActivityUnreadNavIndicator: React.FC = () => {
  const unread = useActivityUnread(useContractingActivityViewClient(), canSeeActivity(useAccess().data));

  return unread ? <NavWarningDot label="New Activity" /> : null;
};
