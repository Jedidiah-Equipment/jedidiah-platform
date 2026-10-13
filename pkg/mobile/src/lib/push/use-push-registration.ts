import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { AppState } from 'react-native';

import { useAuthSession } from '../auth-session';
import { addBreadcrumb } from '../observability';
import { useTRPC } from '../trpc';
import { type PushAudience, pushAudienceFor } from './push-audience';
import { registerForPush, requestNotificationsAndRegister } from './register-push';

/** Who the signed-in person is to push; keyed on the fields it reads, since a session refetch replaces the object. */
export function usePushAudience(): PushAudience {
  const {
    user: { id, role, contractingRole, isDevice },
  } = useAuthSession();
  return useMemo(() => pushAudienceFor({ id, role, contractingRole, isDevice }), [id, role, contractingRole, isDevice]);
}

function useRegisterPushToken() {
  const trpc = useTRPC();
  return useMutation(trpc.pushTokens.register.mutationOptions()).mutateAsync;
}

/**
 * Every sign-in claims this install, so a phone stops pinging whoever used it before. Turning notifications on in the
 * phone's settings does not restart the app, and a failed call is worth another go: until this install is
 * registered, every return to the foreground tries again. The OS prompt itself is shown at most once per user, and
 * only to someone a Push Kind can reach.
 */
export function usePushRegistration(): void {
  const register = useRegisterPushToken();
  const { userId, channels, mayAsk } = usePushAudience();

  useEffect(() => {
    let settled = false;
    let running = false;
    const attempt = () => {
      if (settled || running) return;
      running = true;
      registerForPush({ userId, channels, mayAsk, register })
        .then((outcome) => {
          settled = outcome !== 'denied';
          addBreadcrumb('lifecycle', 'push registration', { outcome });
        })
        .catch(() => addBreadcrumb('lifecycle', 'push registration failed'))
        .finally(() => {
          running = false;
        });
    };
    attempt();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') attempt();
    });
    return () => subscription.remove();
  }, [channels, mayAsk, userId, register]);
}

/** App Settings' Allow for notifications: the OS prompt again when it is still on offer, then this install claimed. */
export function useRequestNotifications(): () => Promise<void> {
  const register = useRegisterPushToken();
  const { userId, channels } = usePushAudience();

  return useCallback(async () => {
    const outcome = await requestNotificationsAndRegister({ userId, channels, register });
    addBreadcrumb('lifecycle', 'push permission asked', { outcome });
  }, [channels, register, userId]);
}
