import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import { useEffect } from 'react';

import { addBreadcrumb } from '../observability';
import { pushPathFromData } from './push-path';

export const pushPathFromResponse = (response: Notifications.NotificationResponse | null) =>
  pushPathFromData(response?.notification.request.content.data);

/**
 * Opens the record a tapped push names, whether the tap launched the app or reached it running. The business is in
 * the path, so landing there is the mode switch; the protected layout sends a signed-out phone to sign-in first.
 */
export function usePushResponseNavigation(): void {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const path = pushPathFromResponse(response);
      if (!path) return;
      addBreadcrumb('navigation', 'push opened', { kind: String(response?.notification.request.content.data?.kind) });
      Notifications.clearLastNotificationResponse();
      router.push(path as Href);
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
