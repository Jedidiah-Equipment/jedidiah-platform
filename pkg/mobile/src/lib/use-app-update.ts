import * as Updates from 'expo-updates';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  resolveUpdatePrompt,
  selectOfferedUpdate,
  shouldCheckForUpdate,
  type UpdateInstallState,
  type UpdatePromptState,
} from './app-update';
import { addBreadcrumb, captureEvent, captureException } from './observability';

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
  install: (updateKey: string) => void;
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
  const [installUpdateKey, setInstallUpdateKey] = useState<string | null>(null);
  const [dismissedUpdateKey, setDismissedUpdateKey] = useState<string | null>(null);
  // Expo gives no way to abort a download in flight, so backing out bumps this instead: a fetch
  // that lands after the user walked away finds a stale generation and never restarts the app.
  const installGeneration = useRef(0);

  const snapshot = {
    availableUpdate,
    downloadedUpdate,
    isEnabled: Updates.isEnabled,
    isUpdateAvailable,
    isUpdatePending,
  };
  const isOfferedUpdateDownloaded = selectOfferedUpdate(snapshot)?.isDownloaded ?? false;

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
      if (due) {
        addBreadcrumb('ota', 'update check started');
        void Updates.checkForUpdateAsync()
          .then((result) => {
            addBreadcrumb('ota', 'update check finished', { available: result.isAvailable });
            if (result.isAvailable) addBreadcrumb('ota', 'update available');
          })
          .catch((error) => {
            captureException(error, { source: 'ota_check' });
            addBreadcrumb('ota', 'update check finished', { outcome: 'failed' });
          });
      }
    });

    return () => subscription.remove();
  }, [isChecking, isDownloading, lastCheckForUpdateTimeSinceRestart]);

  const install = useCallback(
    (updateKey: string) => {
      installGeneration.current += 1;
      const generation = installGeneration.current;
      const abandoned = () => installGeneration.current !== generation;
      setInstallUpdateKey(updateKey);
      setInstallState('installing');

      void (async () => {
        try {
          // Only skip the fetch when the update being offered is the one already on the device —
          // a pending download can be older than what the last check turned up.
          if (!isOfferedUpdateDownloaded) {
            addBreadcrumb('ota', 'download started', { updateKey });
            const fetched = await Updates.fetchUpdateAsync();
            addBreadcrumb('ota', 'download finished', { updateKey });
            // The update can expire or be rolled back between the check and the fetch.
            // `fetchUpdateAsync` resolves happily in that case, and reloading would restart into
            // the same version and offer it again on the way back up.
            if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
              if (!abandoned()) setInstallState('failed');
              captureEvent('app update failed', { stage: 'download', updateKey });
              addBreadcrumb('ota', 'prompt failed', { stage: 'download', updateKey });
              return;
            }
          }

          if (abandoned()) return;
          captureEvent('app update installed', { updateKey });
          addBreadcrumb('ota', 'prompt installed', { updateKey });
          await Updates.reloadAsync();
        } catch (error) {
          captureException(error, { source: 'ota_install', updateKey });
          captureEvent('app update failed', { stage: 'install', updateKey });
          addBreadcrumb('ota', 'prompt failed', { stage: 'install', updateKey });
          if (!abandoned()) setInstallState('failed');
        }
      })();
    },
    [isOfferedUpdateDownloaded],
  );

  const dismiss = useCallback((updateKey: string) => {
    installGeneration.current += 1;
    setInstallState('idle');
    setInstallUpdateKey(null);
    setDismissedUpdateKey(updateKey);
    captureEvent('app update dismissed', { updateKey });
    addBreadcrumb('ota', 'prompt dismissed', { updateKey });
  }, []);

  const prompt = resolveUpdatePrompt({ dismissedUpdateKey, installState, installUpdateKey, snapshot });
  const offeredKey = prompt.kind === 'offered' ? prompt.updateKey : null;
  const lastOfferedKey = useRef<string | null>(null);
  useEffect(() => {
    if (!offeredKey || lastOfferedKey.current === offeredKey) return;
    lastOfferedKey.current = offeredKey;
    captureEvent('app update offered', { updateKey: offeredKey });
    addBreadcrumb('ota', 'prompt offered', { updateKey: offeredKey });
  }, [offeredKey]);

  return {
    dismiss,
    install,
    prompt,
  };
}
