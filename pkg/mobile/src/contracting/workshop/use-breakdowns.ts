import { breakdownReadScope } from '@pkg/domain/contracting';
import type { BreakdownStatus, BreakdownSubjectRef } from '@pkg/schema/contracting';
import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { DecorateMutationProcedure, ResolverDef } from '@trpc/tanstack-react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { isNotFoundError } from '@/lib/trpc-errors';

const PAGE_SIZE = 25;
export const BREAKDOWN_SAVE_FAILED = 'Could not save. Check your connection and try again.';

type BreakdownRoutes = ReturnType<typeof useTRPC>['contractingBreakdowns'];

/** Every Breakdown for the workshop, a reporter's own for a Foreman, or none. */
export function useBreakdownScope() {
  return breakdownReadScope(useSessionAccessSummary());
}

export function useBreakdownList({
  search,
  statuses,
  mechanicUserIds,
}: {
  search: string;
  statuses: readonly BreakdownStatus[];
  mechanicUserIds: readonly string[];
}) {
  const canRead = useBreakdownScope() !== null;
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.contractingBreakdowns.list.infiniteQueryOptions(
      {
        search,
        statuses: [...statuses],
        mechanicUserIds: [...mechanicUserIds],
        limit: PAGE_SIZE,
        sortBy: 'reportedAt',
        sortDirection: 'desc',
      },
      {
        enabled: canRead,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
  );
}

/** Each status's Breakdown count, for the workshop's status filter; a Foreman reading only his own gets none. */
export function useBreakdownStatusCounts() {
  const canReadAll = useBreakdownScope() === 'all';
  const trpc = useTRPC();
  return useQuery(
    trpc.contractingBreakdowns.queueSummary.queryOptions(undefined, {
      enabled: canReadAll,
      select: (summary) => summary.counts,
    }),
  );
}

/** `gone` once it is not this person's to read. */
export function useBreakdown(breakdownId: string) {
  const canRead = useBreakdownScope() !== null;
  const trpc = useTRPC();
  const query = useQuery(
    trpc.contractingBreakdowns.get.queryOptions({ id: breakdownId }, { enabled: canRead && !!breakdownId }),
  );
  return { ...fieldQuery(canRead, query), gone: isNotFoundError(query.error) };
}

/**
 * One Breakdown mutation whose success refetches every Breakdown read before it settles, so a screen's busy state
 * covers the refetch and the detail it shows is the server's.
 */
export function useBreakdownMutation<TDef extends ResolverDef>(
  select: (breakdowns: BreakdownRoutes) => DecorateMutationProcedure<TDef>,
) {
  const trpc = useTRPC();
  const refetch = useRefetchBreakdowns();
  return useMutation(select(trpc.contractingBreakdowns).mutationOptions({ onSuccess: refetch }));
}

/** The same for a Breakdown write that goes over plain HTTP, as the photo uploads do. */
export function useBreakdownUpload<TVariables, TData>(upload: (variables: TVariables) => Promise<TData>) {
  const refetch = useRefetchBreakdowns();
  return useMutation({ mutationFn: upload, onSuccess: refetch });
}

function useRefetchBreakdowns() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() });
}

/** Unsolved Breakdowns already reported on the chosen subject: the report screen's duplicate check. */
export function useOpenOnSubject(subject: BreakdownSubjectRef | null) {
  const canReport = useSessionPermission('contracting_breakdown:report');
  const trpc = useTRPC();
  return fieldQuery(
    canReport && subject !== null,
    useQuery(trpc.contractingBreakdowns.field.openOnSubject.queryOptions(canReport && subject ? subject : skipToken)),
  );
}

export function useMechanics() {
  const canAssign = useSessionPermission('contracting_breakdown:update');
  const trpc = useTRPC();
  return fieldQuery(
    canAssign,
    useQuery(trpc.contractingBreakdowns.options.mechanics.queryOptions(undefined, { enabled: canAssign })),
  );
}

/** A Machine's unsolved Breakdowns, newest first, for the workshop's view of the Machine. */
export function useMachineBreakdowns(machineId: string) {
  const canRead = useSessionPermission('contracting_breakdown:read');
  const trpc = useTRPC();
  return fieldQuery(
    canRead && !!machineId,
    useQuery(
      trpc.contractingBreakdowns.list.queryOptions(
        { machineId, limit: 0, sortBy: 'reportedAt', sortDirection: 'desc' },
        { enabled: canRead && !!machineId },
      ),
    ),
  );
}
