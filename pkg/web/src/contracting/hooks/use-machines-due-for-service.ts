import { machinesDueForService } from '@pkg/domain/contracting';
import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_REFETCH_INTERVAL_MS } from '@/contracting/lib/dashboard-refresh.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * The active fleet's Machines Due for Service, overdue first: one cached Machine list read, selected on the client,
 * behind the menu dot, the Dashboard block and the Services page's pinned rows.
 */
export function useMachinesDueForService({ enabled = true }: { enabled?: boolean } = {}) {
  const trpc = useTRPC();
  return useQuery({
    ...trpc.contractingFleet.machines.list.queryOptions({ status: 'active' }),
    enabled,
    refetchInterval: DASHBOARD_REFETCH_INTERVAL_MS,
    select: machinesDueForService,
  });
}
