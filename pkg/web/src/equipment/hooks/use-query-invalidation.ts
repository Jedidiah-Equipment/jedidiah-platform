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
  const invalidateFeedback = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.feedback.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateJobActivity = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.jobActivity.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateJobs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.jobs.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateLaborRates = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.laborRates.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateInventory = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
    [queryClient, trpc],
  );
  // Renaming a Part Category changes the name every Part reads, and the order Product Assemblies list Parts in.
  const invalidatePartCategories = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.partCategories.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.products.pathKey() }),
      ]),
    [queryClient, trpc],
  );
  // A Part write moves Part Category counts too.
  const invalidateParts = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.partCategories.pathKey() }),
      ]),
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
  const invalidateCatalogTranslations = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.catalogTranslations.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateProductUnits = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.productUnits.pathKey() }),
    [queryClient, trpc],
  );
  // A Parts Sale's code, Customer, title and status also ride the inventory reads stores pick it from.
  const invalidateQuotes = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
      ]),
    [queryClient, trpc],
  );
  const invalidatePurchaseOrders = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.purchaseOrders.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateSuppliers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.suppliers.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateUserDepartments = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.userDepartments.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateUsers = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.users.pathKey() }),
    [queryClient, trpc],
  );
  return useMemo(
    () => ({
      invalidateAudit,
      invalidateAuth,
      invalidateCatalogTranslations,
      invalidateCustomers,
      invalidateDocuments,
      invalidateFeedback,
      invalidateJobActivity,
      invalidateJobs,
      invalidateLaborRates,
      invalidateInventory,
      invalidatePartCategories,
      invalidateParts,
      invalidateProductRanges,
      invalidateProducts,
      invalidateProductUnits,
      invalidatePurchaseOrders,
      invalidateQuotes,
      invalidateSuppliers,
      invalidateUserDepartments,
      invalidateUsers,
    }),
    [
      invalidateAudit,
      invalidateAuth,
      invalidateCatalogTranslations,
      invalidateCustomers,
      invalidateDocuments,
      invalidateFeedback,
      invalidateJobActivity,
      invalidateJobs,
      invalidateLaborRates,
      invalidateInventory,
      invalidatePartCategories,
      invalidateParts,
      invalidateProductRanges,
      invalidateProducts,
      invalidateProductUnits,
      invalidatePurchaseOrders,
      invalidateQuotes,
      invalidateSuppliers,
      invalidateUserDepartments,
      invalidateUsers,
    ],
  );
}
