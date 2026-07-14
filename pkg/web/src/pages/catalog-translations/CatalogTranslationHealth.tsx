import { useMutation, useQuery } from '@tanstack/react-query';
import type React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useApiMutationErrorToast } from '@/hooks/use-api-mutation-error-toast.js';
import { useQueryInvalidation } from '@/hooks/use-query-invalidation.js';
import { useTRPC } from '@/lib/trpc.js';
import { CatalogTranslationHealthCard, catalogTranslationAiQueueCount } from './CatalogTranslationHealthCard.js';

// Recovery now runs immediately, so the card only needs a short refetch burst to watch counts settle.
const TRANSLATION_HEALTH_POLL_INTERVAL_MS = 3_000;
const TRANSLATION_HEALTH_POLL_WINDOW_MS = 30_000;

export const CatalogTranslationHealth: React.FC = () => {
  const trpc = useTRPC();
  const showMutationError = useApiMutationErrorToast();
  const { invalidateCatalogTranslations } = useQueryInvalidation();
  const [isPolling, setIsPolling] = useState(false);
  const statusQuery = useQuery({
    ...trpc.catalogTranslations.translationStatus.queryOptions(),
    refetchInterval: ({ state }) => {
      const status = state.data;
      return isPolling && status && catalogTranslationAiQueueCount(status) > 0
        ? TRANSLATION_HEALTH_POLL_INTERVAL_MS
        : false;
    },
  });
  const retranslateMutation = useMutation(
    trpc.catalogTranslations.retranslateStale.mutationOptions({
      onError: (error) => showMutationError(error, 'Unable to queue Afrikaans translations.'),
      onSuccess: async ({ queued }) => {
        if (queued > 0) {
          setIsPolling(true);
          setTimeout(() => setIsPolling(false), TRANSLATION_HEALTH_POLL_WINDOW_MS);
        }
        await invalidateCatalogTranslations();
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
