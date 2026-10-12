import { useMutation } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { addBreadcrumb } from '../observability';
import { useTRPC } from '../trpc';
import { type PushChannel, registerForPush } from './register-push';

/**
 * Every sign-in claims this install, so a phone stops pinging whoever used it before. Turning notifications on in the
 * phone's settings does not restart the app, and a failed call is worth another go: until this install is
 * registered, every return to the foreground tries again. The OS prompt itself is shown at most once per user.
 */
export function usePushRegistration({
  userId,
  channel,
  mayAsk,
}: {
  userId: string;
  channel: PushChannel;
  mayAsk: boolean;
}): void {
  const trpc = useTRPC();
  const { mutateAsync: register } = useMutation(trpc.pushTokens.register.mutationOptions());

  useEffect(() => {
    let settled = false;
    let running = false;
    const attempt = () => {
      if (settled || running) return;
      running = true;
      registerForPush({ userId, channel, mayAsk, register })
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
  }, [channel, mayAsk, userId, register]);
}
