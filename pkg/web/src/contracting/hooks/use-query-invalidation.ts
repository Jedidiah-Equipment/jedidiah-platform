import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { useTRPC } from '@/lib/trpc.js';

export function useQueryInvalidation() {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  // Activity reads its items off Jobs, Breakdowns and readings: a write that adds or changes one refreshes the feed and its dot.
  const invalidateActivity = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingActivity.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateDirectory = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingDirectory.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateFleet = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingFleet.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateReadings = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() }),
        invalidateActivity(),
      ]),
    [queryClient, trpc, invalidateActivity],
  );
  const invalidateJobs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateRateCard = useCallback(
    () => queryClient.invalidateQueries({ queryKey: trpc.contractingRateCard.pathKey() }),
    [queryClient, trpc],
  );
  const invalidateServices = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingServices.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingFleet.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() }),
      ]),
    [queryClient, trpc],
  );
  // A threshold change moves Gap Flags and Service Due badges on every screen that shows them.
  const invalidateSettings = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingSettings.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingFleet.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() }),
      ]),
    [queryClient, trpc],
  );
  const invalidateWorkshop = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingServices.pathKey() }),
        invalidateActivity(),
      ]),
    [queryClient, trpc, invalidateActivity],
  );

  return useMemo(
    () => ({
      invalidateActivity,
      invalidateDirectory,
      invalidateFleet,
      invalidateJobs,
      invalidateRateCard,
      invalidateReadings,
      invalidateServices,
      invalidateSettings,
      invalidateWorkshop,
    }),
    [
      invalidateActivity,
      invalidateDirectory,
      invalidateFleet,
      invalidateJobs,
      invalidateRateCard,
      invalidateReadings,
      invalidateServices,
      invalidateSettings,
      invalidateWorkshop,
    ],
  );
}
