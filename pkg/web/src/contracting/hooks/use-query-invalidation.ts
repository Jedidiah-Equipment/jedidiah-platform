import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export function useQueryInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const invalidateDirectory = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingDirectory.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateFleet = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingFleet.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateReadings = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateRateCard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingRateCard.pathKey() }),
    [queryClient, trpc],
  );

  return useMemo(
    () => ({ invalidateDirectory, invalidateFleet, invalidateRateCard, invalidateReadings }),
    [invalidateDirectory, invalidateFleet, invalidateRateCard, invalidateReadings],
  );
}
