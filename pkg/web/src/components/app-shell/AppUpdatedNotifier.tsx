import { useEffect } from 'react';
import { toast } from 'sonner';

import { getClientConfig } from '@/lib/app-config.js';
import {
  APP_UPDATED_TOAST_ID,
  APP_VERSION_POLL_INTERVAL_MS,
  parseAppVersionResponse,
  shouldShowAppUpdatedToast,
} from './app-updated.js';

export function AppUpdatedNotifier() {
  useEffect(() => {
    const currentVersion = getClientConfig().deploymentVersion;

    // Local/dev builds do not always have Railway metadata, so missing metadata disables update detection.
    if (!currentVersion) {
      return;
    }

    let isMounted = true;
    let hasShownUpdateToast = false;

    const checkForUpdate = async () => {
      try {
        const response = await fetch('/app-version', { cache: 'no-store' });
        const latest = parseAppVersionResponse(await response.json());
        console.info('[app-update] Version check', {
          clientVersion: currentVersion,
          serverVersion: latest.deploymentVersion,
        });

        if (!isMounted || hasShownUpdateToast || !shouldShowAppUpdatedToast(currentVersion, latest.deploymentVersion)) {
          return;
        }

        hasShownUpdateToast = true;
        toast.info('App Updated', {
          id: APP_UPDATED_TOAST_ID,
          description: 'A new version is available.',
          duration: Infinity,
          closeButton: true,
          action: {
            label: 'Reload',
            onClick: () => window.location.reload(),
          },
        });
      } catch {
        // The next poll will retry; update checks should never interrupt normal app usage.
      }
    };

    const intervalId = window.setInterval(() => {
      void checkForUpdate();
    }, APP_VERSION_POLL_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return null;
}
