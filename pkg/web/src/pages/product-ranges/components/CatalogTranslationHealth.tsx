import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { CatalogTranslationHealthCard, catalogTranslationHealthCount } from './CatalogTranslationHealthCard.js';

const TRANSLATION_HEALTH_POLL_INTERVAL_MS = 10_000;
const TRANSLATION_HEALTH_POLL_WINDOW_MS = 5 * 60_000;

export const CatalogTranslationHealth: React.FC = () => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateProductRanges } = useQueryInvalidation();
  const [pollUntil, setPollUntil] = useState(0);
  const statusQuery = useQuery({
    ...trpc.productRanges.translationStatus.queryOptions(),
    refetchInterval: ({ state }) => {
      const status = state.data;
      return pollUntil > Date.now() && status && catalogTranslationHealthCount(status) > 0
        ? TRANSLATION_HEALTH_POLL_INTERVAL_MS
        : false;
    },
  });
  const retranslateMutation = useMutation(
    trpc.productRanges.retranslateStale.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to queue Afrikaans translations.'),
      onSuccess: async ({ queued }) => {
        if (queued > 0) setPollUntil(Date.now() + TRANSLATION_HEALTH_POLL_WINDOW_MS);
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
