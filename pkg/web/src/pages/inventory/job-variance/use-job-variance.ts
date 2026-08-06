import type { UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { useCan } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';

/**
 * One Job's material variance, and whether this reader may see what it cost.
 *
 * The two go together everywhere the report is shown — the Job sheet's tab and the inventory
 * screen — and the gate is UX only: the server has already nulled the money for a caller who may
 * not read costs (`pkg/web/AGENTS.md`). Pairing them here is what stops one surface from showing a
 * column the other hides.
 */
export function useJobVariance(jobId: UUID) {
  const trpc = useTRPC();
  const query = useQuery(trpc.inventory.jobVariance.queryOptions({ jobId }));

  return { query, showCosts: useCan('inventory_cost:read').can };
}
