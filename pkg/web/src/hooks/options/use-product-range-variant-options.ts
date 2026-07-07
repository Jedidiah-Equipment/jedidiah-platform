import type { ProductRangeVariantOption, UUID } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';
import { toSelectOptions } from './helpers.js';

const EMPTY_RANGE_ID = '00000000-0000-4000-8000-000000000000' as UUID;

export type { ProductRangeVariantOption } from '@pkg/schema';

export function useProductRangeVariantOptions(rangeId: UUID | '') {
  const trpc = useTRPC();
  const variantsQuery = useQuery({
    ...trpc.products.variantOptions.queryOptions({ rangeId: rangeId || EMPTY_RANGE_ID }),
    enabled: Boolean(rangeId),
  });
  const items: ProductRangeVariantOption[] = variantsQuery.data?.variants ?? [];
  const selectOptions = useMemo(() => toSelectOptions(items, (variant) => variant.name), [items]);

  return {
    items,
    query: variantsQuery,
    selectOptions,
    isFetching: variantsQuery.isFetching,
    isLoading: variantsQuery.isLoading,
    isPending: Boolean(rangeId) && variantsQuery.isPending,
  };
}
