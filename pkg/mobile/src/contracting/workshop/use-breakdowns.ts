import { breakdownReadScope } from '@pkg/domain/contracting';
import type { BreakdownStatus, BreakdownSubjectRef } from '@pkg/schema/contracting';
import { keepPreviousData, skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fieldQuery } from '@/contracting/lib/field-query';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { useTRPC } from '@/lib/trpc';
import { isNotFoundError } from '@/lib/trpc-errors';

const PAGE_SIZE = 25;

/** Every Breakdown for the workshop, a reporter's own for a Foreman, or none. */
export function useBreakdownScope() {
  return breakdownReadScope(useSessionAccessSummary());
}

export function useBreakdownList(statuses: readonly BreakdownStatus[]) {
  const canRead = useBreakdownScope() !== null;
  const trpc = useTRPC();
  return useInfiniteQuery(
    trpc.contractingBreakdowns.list.infiniteQueryOptions(
      { statuses: [...statuses], limit: PAGE_SIZE, sortBy: 'reportedAt', sortDirection: 'desc' },
      {
        enabled: canRead,
        getNextPageParam: (page) => page.nextCursor,
        initialCursor: 0,
        placeholderData: keepPreviousData,
      },
    ),
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
