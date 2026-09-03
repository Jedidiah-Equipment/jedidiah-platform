import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

export function useClearQueryCache() {
  const queryClient = useQueryClient();
  return useCallback(() => queryClient.clear(), [queryClient]);
}
