import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  resolveUpdatePrompt,
  shouldCheckForUpdate,
  type UpdateInstallState,
  type UpdatePromptState,
} from './app-update';

/**
 * Drives the update prompt: expo's own update state, plus the foreground re-check and the two
 * things expo does not track — whether the user dismissed this update, and whether the install they
 * asked for is running or failed. The decisions live in `app-update.ts`; this only wires them to
 * the platform.
 *
 * On web expo's stub reports updates enabled but never finds one, so this quietly does nothing
 * there; on a native dev client `isEnabled` is false and even the check is skipped.
 */
export function useAppUpdate(): {
  dismiss: (updateKey: string) => void;
  install: () => void;
  prompt: UpdatePromptState;
} {
  const {
    availableUpdate,
    downloadedUpdate,
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdatePending,
    lastCheckForUpdateTimeSinceRestart,
  } = Updates.useUpdates();
  const [installState, setInstallState] = useState<UpdateInstallState>('idle');
  const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | null>(null);
  // Expo gives no way to abort a download in flight, so backing out bumps this instead: a fetch
  // that lands after the user walked away finds a stale generation and never restarts the app.
  const installGeneration = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') return;

      const due = shouldCheckForUpdate({
        isChecking,
        isDownloading,
        isEnabled: Updates.isEnabled,
        lastCheckedAt: lastCheckForUpdateTimeSinceRestart,
        now: Date.now(),
      });
      // A failed check just means no prompt this time; the next foreground asks again.
      if (due) Updates.checkForUpdateAsync().catch(() => {});
    });

    return () => subscription.remove();
  }, [isChecking, isDownloading, lastCheckForUpdateTimeSinceRestart]);

  const install = useCallback(() => {
    installGeneration.current += 1;
    const generation = installGeneration.current;
    const abandoned = () => installGeneration.current !== generation;
    setInstallState('installing');

    void (async () => {
      try {
        if (!isUpdatePending) {
          const fetched = await Updates.fetchUpdateAsync();
          // The update can expire or be rolled back between the check and the fetch. Reloading then
          // would restart into the same version and offer it again on the way back up.
          if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
            if (!abandoned()) setInstallState('failed');
            return;
          }
        }

        if (abandoned()) return;
        await Updates.reloadAsync();
      } catch {
        if (!abandoned()) setInstallState('failed');
      }
    })();
  }, [isUpdatePending]);

  const dismiss = useCallback((updateKey: string) => {
    installGeneration.current += 1;
    setInstallState('idle');
    setDismissedUpdateKey(updateKey);
  }, []);

  return {
    dismiss,
    install,
    prompt: resolveUpdatePrompt({
      dismissedUpdateKey,
      installState,
      snapshot: {
        availableUpdate,
        downloadedUpdate,
        isEnabled: Updates.isEnabled,
        isUpdateAvailable,
        isUpdatePending,
      },
    }),
  };
}
