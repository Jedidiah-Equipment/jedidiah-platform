import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { Skeleton } from '@/components/ui/skeleton.js';
import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { JobVarianceReport } from './JobVarianceReport.js';

/**
 * The Job's material variance beside its stock tab (spec §3, §12). The same report the inventory
 * screen serves — read here by whoever is already looking at the Job, there by the storeman closing
 * it out, who holds `inventory:read` without `job:read` and so never reaches this sheet.
 */
export function JobVarianceTab({ jobId }: { jobId: UUID }) {
  const trpc = useTRPC();
  const showCosts = useCan('inventory_cost:read').can;
  const varianceQuery = useQuery(trpc.inventory.jobVariance.queryOptions({ jobId }));

  if (varianceQuery.isPending) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (varianceQuery.error) {
    return <p className="text-destructive text-sm">Unable to load Job variance.</p>;
  }

  return <JobVarianceReport report={varianceQuery.data} showCosts={showCosts} />;
}
