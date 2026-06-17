import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export function useQueryInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const invalidateAudit = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.audit.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateAuth = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.auth.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateCustomers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.customers.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateDocuments = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.documents.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateJobs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateParts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateProducts = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.products.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateProductRanges = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.productRanges.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateQuotes = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateSuppliers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.suppliers.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateUsers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() }),
    [queryClient, trpc],
  );
  const clearQueryCache = useCallback(() => queryClient.clear(), [queryClient]);

  return useMemo(
    () => ({
      clearQueryCache,
      invalidateAudit,
      invalidateAuth,
      invalidateCustomers,
      invalidateDocuments,
      invalidateJobs,
      invalidateParts,
      invalidateProductRanges,
      invalidateProducts,
      invalidateQuotes,
      invalidateSuppliers,
      invalidateUsers,
    }),
    [
      clearQueryCache,
      invalidateAudit,
      invalidateAuth,
      invalidateCustomers,
      invalidateDocuments,
      invalidateJobs,
      invalidateParts,
      invalidateProductRanges,
      invalidateProducts,
      invalidateQuotes,
      invalidateSuppliers,
      invalidateUsers,
    ],
  );
}
