import { getFirstName } from '@pkg/domain';
import { countPhrase, orderUnsolvedBreakdowns, UNASSIGNED_MECHANIC_LABEL } from '@pkg/domain/contracting';
import type { BreakdownSummary } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DateDisplay } from '@/components/common/DateDisplay.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { BreakdownStatusBadge, BreakdownSubjectLabel } from '@/contracting/components/BreakdownSubjectLabel.js';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/pages/dashboard/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

import { DashboardListBlock, dashboardRowClassName, dashboardRowLinkClassName } from './DashboardListBlock.js';

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
      viewAll={
        <PrimaryLink to="/contracting/workshop" search={{ unsolved: true }}>
          View all
        </PrimaryLink>
      }
      empty="Every Breakdown is Fixed."
      rowKey={(breakdown) => breakdown.id}
      renderRow={(breakdown) => <OpenBreakdownRow breakdown={breakdown} />}
    />
  );
}

function OpenBreakdownRow({ breakdown }: { breakdown: BreakdownSummary }) {
  const { subject } = breakdown;
  return (
    <div className={dashboardRowClassName}>
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
          Reported <DateDisplay date={breakdown.reportedAt} format="duration" /> by{' '}
          {getFirstName(breakdown.reporterName)}
          {breakdown.jobNumber ? ` · ${breakdown.jobNumber}` : ''}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <BreakdownStatusBadge status={breakdown.status} />
        <span className={breakdown.mechanicName ? 'text-xs' : 'text-muted-foreground text-xs'}>
          {breakdown.mechanicName ? getFirstName(breakdown.mechanicName) : UNASSIGNED_MECHANIC_LABEL}
        </span>
      </span>
    </div>
  );
}
