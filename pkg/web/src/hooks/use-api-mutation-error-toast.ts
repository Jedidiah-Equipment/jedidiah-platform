import { usePostHog } from 'posthog-js/react';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { getApiMutationErrorMessage } from '@/lib/api-errors.js';
import { getClientConfig } from '@/lib/app-config.js';

const config = getClientConfig();

export function useApiMutationErrorToast() {
  const posthog = usePostHog();

  return useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (config.posthog.enabled) {
        posthog.captureException(error, { source: 'api_mutation' });
      }
      toast.error(getApiMutationErrorMessage(error, fallbackMessage));
    },
    [posthog],
  );
}
