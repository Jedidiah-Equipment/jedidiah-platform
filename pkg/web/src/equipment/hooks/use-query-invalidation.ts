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
  // A movement also changes what a Parts Sale has drawn, which is served from its own root.
  const invalidateInventory = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.inventory.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventoryQuotes.pathKey() }),
      ]),
    [queryClient, trpc],
  );
  // Parts read their Category's name, so a Category write moves both roots. A rename (or a merge
  // moving Parts under the survivor's name) also changes the name Products show for a Part and the
  // order Product Assemblies list Parts in, so Products joins the affected roots then.
  const invalidatePartCategories = useCallback(
    ({ nameChanged = false }: { nameChanged?: boolean } = {}) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.partCategories.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.parts.pathKey() }),
        nameChanged ? queryClient.invalidateQueries({ queryKey: trpc.products.pathKey() }) : undefined,
      ]),
    [queryClient, trpc],
  );
  // A Part write moves the Part Category counts the admin list reads.
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
  // A Parts Sale's code, Customer, title and status also ride the Quote reads stores make, which sit
  // on their own root precisely so a Quote write does not replay the inventory ledger.
  const invalidateQuotes = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.quotes.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.inventoryQuotes.pathKey() }),
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
