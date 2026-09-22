import type { AuthId } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { mergeSelectedOption, toSelectOptions } from './helpers.js';

type SalesPersonOption = { disabled?: boolean; id: AuthId; name: string };

type UseSalesPersonOptionsOptions = {
  /** The Quote's stored salesperson: still shown, disabled, once off the roster. */
  assigned?: { id: AuthId; name: string | null } | null;
};

export function useSalesPersonOptions({ assigned = null }: UseSalesPersonOptionsOptions = {}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.quotes.salespeople.queryOptions());
  const items = query.data?.users ?? [];
  const assignedId = assigned?.id;
  const assignedName = assigned?.name;
  const selectOptions = useMemo(() => {
    const assignedOption = assignedId && assignedName ? { disabled: true, id: assignedId, name: assignedName } : null;
    return toSelectOptions(mergeSelectedOption<SalesPersonOption>(items, assignedOption), (person) => person.name);
  }, [assignedId, assignedName, items]);

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
