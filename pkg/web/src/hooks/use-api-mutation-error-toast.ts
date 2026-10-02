import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { getApiMutationErrorMessage, shouldReportApiMutationError } from '@/lib/api-errors.js';
import { getClientConfig } from '@/lib/app-config.js';

const config = getClientConfig();

/** Reports an unexpected mutation failure without showing it; for writes whose dialog renders the error. */
export function useApiMutationErrorReport() {
  const posthog = usePostHog();

  return useCallback(
    (error: unknown) => {
      if (!shouldReportApiMutationError(error)) return;
      if (config.posthog.enabled) {
        posthog.captureException(error, { source: 'api_mutation' });
      }
      if (config.appEnv === 'development') {
        console.error('Mutation failed', error);
      }
    },
    [posthog],
  );
}

export function useApiMutationErrorToast() {
  const report = useApiMutationErrorReport();

  return useCallback(
    (error: unknown, fallbackMessage: string) => {
      report(error);
      toast.error(getApiMutationErrorMessage(error, fallbackMessage));
    },
    [report],
  );
}
