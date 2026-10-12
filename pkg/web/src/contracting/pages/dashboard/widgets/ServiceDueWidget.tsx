import { formatHours } from '@pkg/domain';
import {
  countPhrase,
  hoursToServiceLabel,
  machinesDueForService,
  serviceDueStatusColorClassNames,
} from '@pkg/domain/contracting';
import type { Machine } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/components/common/dashboard/dashboard-refresh.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';
import { cn } from '@/lib/utils.js';

import { DashboardListBlock, dashboardRowLinkClassName } from './DashboardListBlock.js';

export function ServiceDueWidget() {
  const trpc = useTRPC();
  const query = useQuery({
    ...trpc.contractingFleet.machines.list.queryOptions({ status: 'active' }),
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    select: machinesDueForService,
  });
  return (
    <DashboardListBlock
      rows={query.data}
      error={query.error}
      errorMessage="Unable to load the fleet."
      count={(total) => countPhrase(total, 'Machine', 'Machines')}
      viewAll={
        <PrimaryLink to="/contracting/fleet" search={{ service: 'attention' }}>
          View all
        </PrimaryLink>
      }
      empty="No Machine is due for service."
      rowKey={(machine) => machine.id}
      renderRow={(machine) => <ServiceDueRow machine={machine} />}
    />
  );
}

export function ServiceDueRow({ machine }: { machine: Machine }) {
  return (
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 text-sm">
      <span className="min-w-0">
        <CategoryLabel
          icon={machine.categoryIcon}
          colour={machine.categoryColour}
          size={16}
          name={
            <Link className={dashboardRowLinkClassName} to="/contracting/fleet/$id/edit" params={{ id: machine.id }}>
              <span className="font-mono font-semibold">{machine.code}</span> {machine.categoryName}
            </Link>
          }
        />
        <span className="mt-1 block truncate text-muted-foreground text-xs">
          {machine.make} {machine.model}
          {machine.busyOnJob ? ` · On ${machine.busyOnJob.jobNumber}` : ''}
        </span>
      </span>
      <span className="text-right">
        {machine.hoursToService !== null ? (
          <span
            className={cn(
              'block font-medium tabular-nums',
              serviceDueStatusColorClassNames[machine.serviceDueStatus].text,
            )}
          >
            {hoursToServiceLabel(machine.hoursToService)}
          </span>
        ) : null}
        {machine.nextServiceDueHours !== null && machine.nextServiceDueHours !== undefined ? (
          <span className="block text-muted-foreground text-xs tabular-nums">
            Due at {formatHours(machine.nextServiceDueHours)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
