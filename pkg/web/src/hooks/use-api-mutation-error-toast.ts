import { useCallback } from 'react';
import { toast } from 'sonner';

import { getApiMutationErrorMessage } from '@/lib/api-errors.js';

export function useApiMutationErrorToast() {
  return useCallback((error: unknown, fallbackMessage: string) => {
    console.error('Mutation failed', error);
    toast.error(getApiMutationErrorMessage(error, fallbackMessage));
  }, []);
}
