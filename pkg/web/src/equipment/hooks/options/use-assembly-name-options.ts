import { useQuery } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc.js';

export function useAssemblyNameOptions() {
  const trpc = useTRPC();
  const query = useQuery(trpc.products.assemblyNames.queryOptions());
  const items = query.data?.names ?? [];

  return {
    items,
    query,
    isFetching: query.isFetching,
    isLoading: query.isLoading,
    isPending: query.isPending,
  };
}
