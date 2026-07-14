import type { CatalogTranslationFieldState } from '@pkg/schema';
import { useCallback, useEffect, useRef, useState } from 'react';

const REGENERATION_POLL_INTERVAL_MS = 2_000;
const REGENERATION_POLL_LIMIT_MS = 5 * 60_000;

type PendingRegeneration<Target> = {
  startedAt: number;
  target: Target;
};

type TargetStateReader<Translation, Target> = (
  translation: Translation,
  target: Target,
) => CatalogTranslationFieldState | undefined;

/**
 * Handing a field back to the AI queues background work. Poll only until that field turns fresh again,
 * and only for a bounded window, so the regenerated value visibly reappears without turning every
 * unhealthy catalog page into a permanent poller.
 */
export function useTranslationRegeneration<Translation, Target>({
  getTargetState,
}: {
  getTargetState: TargetStateReader<Translation, Target>;
}) {
  const [pending, setPending] = useState<PendingRegeneration<Target> | null>(null);
  const readState = useRef(getTargetState);
  readState.current = getTargetState;

  const isRegenerated = (data: Translation | undefined, target: Target) =>
    data !== undefined && readState.current(data, target) === 'fresh';

  return {
    awaitRegeneration: (target: Target) => setPending({ startedAt: Date.now(), target }),
    refetchInterval: (data: Translation | undefined): false | number => {
      if (!pending || Date.now() - pending.startedAt >= REGENERATION_POLL_LIMIT_MS) return false;
      return isRegenerated(data, pending.target) ? false : REGENERATION_POLL_INTERVAL_MS;
    },
    // Call with the loaded translation to stop tracking a field once its AI value has landed.
    settleRegeneration: useCallback((data: Translation | undefined) => {
      setPending((current) => {
        if (!current || data === undefined) return current;
        return readState.current(data, current.target) === 'fresh' ? null : current;
      });
    }, []),
  };
}

/**
 * Enabling Manual persists immediately; turning it off discards hand-written Afrikaans, so it is
 * confirmed first. Either way pending text edits flush before the toggle so the two writes can't race.
 */
export function useManualOverrideToggle<Target>({
  flush,
  isPending,
  onToggle,
}: {
  flush: () => Promise<boolean>;
  isPending: boolean;
  onToggle: (target: Target, isManual: boolean) => Promise<boolean>;
}) {
  const [pendingRevert, setPendingRevert] = useState<Target | null>(null);

  const persist = async (target: Target, isManual: boolean) => {
    if (!(await flush())) return;
    const didSave = await onToggle(target, isManual);
    if (didSave && !isManual) setPendingRevert(null);
  };

  return {
    dismissRevert: (open: boolean) => {
      if (!open && !isPending) setPendingRevert(null);
    },
    confirmRevert: () => {
      if (pendingRevert) void persist(pendingRevert, false);
    },
    enable: (target: Target) => void persist(target, true),
    pendingRevert,
    requestRevert: (target: Target) => setPendingRevert(target),
  };
}

/**
 * Adopts refreshed server values into the form — but never on top of the user's own in-flight work, so a
 * background refetch (translation health invalidation, regeneration poll) can't clobber what they typed.
 */
export function useAutosaveServerSync<Translation, Values>({
  autosave,
  initialValues,
  translation,
}: {
  autosave: {
    hasPendingChanges: () => boolean;
    resetToSavedValues: (values: Values) => void;
    state: { status: string };
  };
  initialValues: Values;
  translation: Translation;
}) {
  const syncedRef = useRef(translation);
  const { hasPendingChanges, resetToSavedValues, state } = autosave;

  const sync = useCallback(() => {
    if (syncedRef.current === translation || state.status === 'saving' || hasPendingChanges()) return;
    resetToSavedValues(initialValues);
    syncedRef.current = translation;
  }, [hasPendingChanges, initialValues, resetToSavedValues, state.status, translation]);

  useEffect(sync, [sync]);
}
