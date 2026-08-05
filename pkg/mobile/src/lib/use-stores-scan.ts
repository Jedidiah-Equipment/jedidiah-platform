import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useStoresActor } from './stores-actor';
import { resolveScan } from './stores-scan-resolution';
import { useTRPC } from './trpc';

/**
 * Wires a scan at the tablet to what should happen next.
 *
 * The deciding lives in `resolveScan`; this is the doing — the lookups, the navigation, and the
 * message a failed scan leaves on screen. Every scan is also an interaction, so it holds the idle
 * timeout open: a person working steadily through a delivery must not be forgotten between boxes.
 */
export function useStoresScan() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { keepAlive, selectActor } = useStoresActor();
  const [scanError, setScanError] = useState<string | null>(null);

  const scan = useCallback(
    async (raw: string) => {
      keepAlive();
      setScanError(null);

      // `resolveScan` turns its own failures into an `error` resolution, so there is nothing to
      // catch here — a scan that goes wrong is a message on the screen, never an unhandled throw.
      const resolution = await resolveScan({
        fetchActors: () => queryClient.fetchQuery(trpc.inventory.quickSwitchActors.queryOptions()),
        fetchPartByCode: (code) => queryClient.fetchQuery(trpc.inventory.partByCode.queryOptions({ code })),
        raw,
      });

      switch (resolution.kind) {
        case 'actor':
          selectActor(resolution.actor);
          break;
        case 'part':
          router.push({ params: { partCode: resolution.partCode }, pathname: '/stores/parts/[partCode]' });
          break;
        case 'error':
          setScanError(resolution.message);
          break;
        case 'ignored':
          break;
      }
    },
    [keepAlive, queryClient, router, selectActor, trpc],
  );

  const clearScanError = useCallback(() => setScanError(null), []);

  return { clearScanError, scan, scanError };
}
