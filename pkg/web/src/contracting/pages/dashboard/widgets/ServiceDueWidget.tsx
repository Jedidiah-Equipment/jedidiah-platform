import { countPhrase, formatHours } from '@pkg/domain';
import type { Machine } from '@pkg/schema/contracting';
import { Link } from '@tanstack/react-router';
import {
  DashboardListBlock,
  dashboardRowClassName,
  dashboardRowLinkClassName,
} from '@/components/common/dashboard/DashboardListBlock.js';
import { PrimaryLink } from '@/components/common/PrimaryLink.js';
import { CategoryLabel } from '@/contracting/components/CategoryIcon.js';
import { HoursToServiceLabel, machineHoursToService } from '@/contracting/components/MachineServiceDue.js';
import { useMachinesDueForService } from '@/contracting/hooks/use-machines-due-for-service.js';

export function ServiceDueWidget() {
  const query = useMachinesDueForService();
  return (
    <DashboardListBlock
      rows={query.data}
      error={query.error}
      errorMessage="Unable to load the fleet."
      count={(total) => countPhrase(total, 'Machine', 'Machines')}
      viewAll={<PrimaryLink to="/contracting/services">View all</PrimaryLink>}
      empty="No Machine is due for service."
      rowKey={(machine) => machine.id}
      renderRow={(machine) => <ServiceDueRow machine={machine} />}
    />
  );
}

function ServiceDueRow({ machine }: { machine: Machine }) {
  const toGo = machineHoursToService(machine);
  return (
    <div className={dashboardRowClassName}>
      <span className="min-w-0">
        <CategoryLabel
          icon={machine.categoryIcon}
          colour={machine.categoryColour}
          size={16}
          name={
            <Link
              className={dashboardRowLinkClassName}
              to="/contracting/fleet/$id/edit"
              params={{ id: machine.id }}
              search={{ tab: 'service' }}
            >
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
        {toGo ? <HoursToServiceLabel {...toGo} className="block font-medium tabular-nums" /> : null}
        {machine.nextServiceDueHours !== null ? (
          <span className="block text-muted-foreground text-xs tabular-nums">
            Due at {formatHours(machine.nextServiceDueHours)}
          </span>
        ) : null}
      </span>
    </div>
  );
}
