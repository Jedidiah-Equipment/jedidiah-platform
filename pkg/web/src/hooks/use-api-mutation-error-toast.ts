import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { getApiMutationErrorMessage, shouldReportApiMutationError } from '@/lib/api-errors.js';
import { getClientConfig } from '@/lib/app-config.js';

const config = getClientConfig();

export function useApiMutationErrorToast() {
  const posthog = usePostHog();

  return useCallback(
    (error: unknown, fallbackMessage: string) => {
      const shouldReport = shouldReportApiMutationError(error);

      if (shouldReport && config.posthog.enabled) {
        posthog.captureException(error, { source: 'api_mutation' });
      }
      if (shouldReport && config.appEnv === 'development') {
        console.error('Mutation failed', error);
      }
      toast.error(getApiMutationErrorMessage(error, fallbackMessage));
    },
    [posthog],
  );
}
