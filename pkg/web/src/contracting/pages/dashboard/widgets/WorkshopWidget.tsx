import { formatDate } from '@pkg/domain';
import { countPhrase, orderUnsolvedBreakdowns } from '@pkg/domain/contracting';
import type { BreakdownSummary } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { BreakdownStatusBadge, BreakdownSubjectLabel } from '@/contracting/components/BreakdownSubjectLabel.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardListBlock, dashboardRowLinkClassName } from './DashboardListBlock.js';

export function WorkshopWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingBreakdowns.list.queryOptions({ statuses: ['open', 'in-progress'], limit: 0 }),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    select: (result) => orderUnsolvedBreakdowns(result.items),
  });
  return (
    <DashboardListBlock
      rows={query.data}
      error={query.error}
      errorMessage="Unable to load Breakdowns."
      count={(total) => countPhrase(total, 'Breakdown not yet Fixed', 'Breakdowns not yet Fixed')}
      viewAll={<PrimaryLink to="/contracting/workshop">View all</PrimaryLink>}
      empty="Every Breakdown is Fixed."
      rowKey={(breakdown) => breakdown.id}
      renderRow={(breakdown) => <OpenBreakdownRow breakdown={breakdown} />}
    />
  );
}

export function OpenBreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const { subject } = breakdown;
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
      <span className="min-w-0">
        <BreakdownSubjectLabel
          urgency={breakdown.urgency}
          subject={subject}
          size={16}
          name={
            <Link className={dashboardRowLinkClassName} to="/contracting/workshop/$id" params={{ id: breakdown.id }}>
              <span className="font-mono font-semibold">{subject.code}</span> {breakdown.firstLine}
            </Link>
          }
        />
        <span className="mt-1 block truncate text-muted-foreground text-xs">
          Reported {formatDate(breakdown.reportedAt, 'duration')} by {breakdown.reporterName}
          {breakdown.jobNumber ? ` · ${breakdown.jobNumber}` : ''}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <BreakdownStatusBadge status={breakdown.status} />
        <span className={breakdown.mechanicName ? 'text-xs' : 'text-muted-foreground text-xs'}>
          {breakdown.mechanicName ?? 'Unassigned'}
        </span>
      </span>
    </div>
  );
}
