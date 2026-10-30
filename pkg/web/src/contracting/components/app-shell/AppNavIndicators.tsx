import { countPhrase, formatNumber } from '@pkg/domain';
import { canSeeActivity } from '@pkg/domain/contracting';
import { useQuery } from '@tanstack/react-query';
import type React from 'react';

import { useActivityUnread } from '@/components/activity/use-activity-view.js';
import { NavWarningDot } from '@/components/app-shell/NavWarningDot.js';
import { useContractingActivityViewClient } from '@/contracting/components/activity/activity-view-client.js';
import { useMachinesDueForService } from '@/contracting/hooks/use-machines-due-for-service.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { useAccess, useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

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

/** How many Machines are Due for Service: the Services page's pinned rows. */
export const ServicesNavIndicator: React.FC = () => {
  const dueQuery = useMachinesDueForService({ enabled: useCan('contracting_service:read').can });
  const count = dueQuery.data?.length ?? 0;

  return count > 0 ? <NavWarningDot label={`${countPhrase(count, 'Machine', 'Machines')} due for a service`} /> : null;
};

/** The newest Activity item lies beyond this person's Contracting Activity View; opening Activity on All clears it. */
export const ActivityUnreadNavIndicator: React.FC = () => {
  const unread = useActivityUnread(useContractingActivityViewClient(), canSeeActivity(useAccess().data));

  return unread ? <NavWarningDot label="New Activity" /> : null;
};
