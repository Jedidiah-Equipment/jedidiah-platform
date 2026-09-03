import { unacknowledgedWarnings } from '@pkg/domain';
import type { StockMovementPostResult, StockMovementWarningCode } from '@pkg/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppToast } from '@/components/ui/toast';

import { invalidateQueryCache } from '@/lib/query-client';
import { useTRPC } from '@/lib/trpc';
import { useStoresActor } from './stores-actor';

/** The scanned Part a posting screen is working on, loaded the same way the Part screen loaded it. */
export function usePartByCode(partCode: string) {
  const trpc = useTRPC();

  return useQuery(trpc.inventory.partByCode.queryOptions({ code: partCode }));
}

/**
 * What every posting screen does *around* its post: hold the idle timeout open, refresh what
 * changed, say it landed, and surface whatever the ledger thought of it.
 *
 * Deliberately not a wrapper around `useMutation`. Each procedure's input and error types differ,
 * and a generic wrapper over them buys nothing a screen cannot spell out in one line — so this owns
 * the outcome and the screen owns the call.
 *
 * The warnings held here are what the post added on top of whatever the screen already confirmed.
 * The preview and the post read the same served facts through the same derivation, so agreement is
 * the normal case and this stays empty; what lands here is the ledger having moved under the scan.
 * Holding it in state rather than toasting it is what lets the screen block until it has been read.
 */
export function useStoresPostOutcome({ successMessage, returnTo }: { successMessage: string; returnTo: Href }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useAppToast();
  const { keepAlive } = useStoresActor();
  const [warnings, setWarnings] = useState<StockMovementPostResult['warnings']>([]);
  const [acknowledged, setAcknowledged] = useState<readonly StockMovementWarningCode[]>([]);

  const onError = (error: { message: string }) => toast('error', error.message);

  const onSuccess = async (result: StockMovementPostResult) => {
    await invalidateQueryCache(queryClient);
    toast('success', successMessage);

    const unseen = unacknowledgedWarnings({ acknowledged, posted: result.warnings });
    setWarnings(unseen);
    // A post that said nothing the operator had not already agreed to returns the tablet to the scan
    // field for the next item; one that found something waits, so the dialog is not dismissed by the
    // navigation that would otherwise follow it.
    if (unseen.length === 0) router.dismissTo(returnTo);
  };

  const acknowledgeWarnings = () => {
    setWarnings([]);
    router.dismissTo(returnTo);
  };

  return { acknowledge: setAcknowledged, acknowledgeWarnings, keepAlive, onError, onSuccess, warnings };
}
