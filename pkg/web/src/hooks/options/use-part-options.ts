import type { Part, PartListInput } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import type { SelectOption } from './helpers.js';

type PartSelectOption = SelectOption & {
  unitOfMeasure: Part['unitOfMeasure'];
};

type UsePartOptionsOptions = {
  limit?: number;
  sortBy?: PartListInput['sortBy'];
  sortDirection?: PartListInput['sortDirection'];
};

export function usePartOptions({ limit = 20, sortBy = 'name', sortDirection = 'asc' }: UsePartOptionsOptions = {}) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.parts.list.queryOptions({
      columnFilters: {},
      cursor: 0,
      limit,
      sortBy,
      sortDirection,
    }),
  );
  const items = query.data?.items ?? [];
  const selectOptions = useMemo<PartSelectOption[]>(
    () =>
      items.map((part) => ({
        label: part.name,
        unitOfMeasure: part.unitOfMeasure,
        value: part.id,
      })),
    [items],
  );

  return {
    items,
    query,
    selectOptions,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
