import type { StockMovementPostResult } from '@pkg/schema';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppToast } from '@/components/ui/toast';

import { invalidateQueryCache } from './query-client';
import { useStoresActor } from './stores-actor';
import { useTRPC } from './trpc';

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
 * The warnings held here are the ones the *server* returned. Nothing in the tablet re-derives them
 * (see `MovementWarningModal`), so this is the only place they can come from — and holding them in
 * state rather than toasting them is what lets the screen block until they have been read.
 */
export function useStoresPostOutcome({ successMessage, returnTo }: { successMessage: string; returnTo: Href }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const toast = useAppToast();
  const { keepAlive } = useStoresActor();
  const [warnings, setWarnings] = useState<StockMovementPostResult['warnings']>([]);

  const onError = (error: { message: string }) => toast('error', error.message);

  const onSuccess = async (result: StockMovementPostResult) => {
    await invalidateQueryCache(queryClient);
    toast('success', successMessage);
    setWarnings(result.warnings);
    // A clean post returns the tablet to the scan field for the next item straight away; a warned
    // one waits, so the dialog is not dismissed by the navigation that would follow it.
    if (result.warnings.length === 0) router.dismissTo(returnTo);
  };

  const acknowledgeWarnings = () => {
    setWarnings([]);
    router.dismissTo(returnTo);
  };

  return { acknowledgeWarnings, keepAlive, onError, onSuccess, warnings };
}
