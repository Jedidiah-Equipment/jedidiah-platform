import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { toast } from 'sonner';

import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { CatalogTranslationHealthCard } from './CatalogTranslationHealthCard.js';

export const CatalogTranslationHealth: React.FC = () => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();
  const statusQuery = useQuery(trpc.productRanges.translationStatus.queryOptions());
  const retranslateMutation = useMutation(
    trpc.productRanges.retranslateStale.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to queue Afrikaans translations.'),
      onSuccess: async ({ queued }) => {
        await invalidateProductRanges();
        toast.success(
          queued === 1 ? '1 item queued for Afrikaans translation' : `${queued} items queued for Afrikaans translation`,
        );
      },
    }),
  );

  return (
    <CatalogTranslationHealthCard
      hasError={Boolean(statusQuery.error)}
      isLoading={statusQuery.isLoading}
      isPending={retranslateMutation.isPending}
      onRetranslate={() => retranslateMutation.mutate()}
      status={statusQuery.data}
    />
  );
};
