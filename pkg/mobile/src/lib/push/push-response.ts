import * as Notifications from 'expo-notifications';
import { type Href, router, usePathname } from 'expo-router';
import { useEffect } from 'react';

import { addBreadcrumb } from '../observability';
import { pushPathFromData } from './push-path';

// A tapped record waiting to be shown: kept until the protected tree reaches it, so a tap that first needs a
// sign-in still lands on its Job, Breakdown or Machine afterwards.
let pendingPath: string | null = null;

/** The tapped push's path the protected tree has not shown yet, for the signed-in landing to open instead. */
export const pendingPushPath = () => pendingPath;

/** Forgets the pending path once the protected tree shows it. */
export function useSettlePendingPushPath(): void {
  const pathname = usePathname();
  useEffect(() => {
    if (pendingPath?.split('?')[0] === pathname) pendingPath = null;
  }, [pathname]);
}

export const pushPathFromResponse = (response: Notifications.NotificationResponse | null) =>
  pushPathFromData(response?.notification.request.content.data);

/**
 * Opens the record a tapped push names, whether the tap launched the app or reached it running. The business is in
 * the path, so landing there is the mode switch. A signed-out phone signs in first and then lands on the record.
 */
export function usePushResponseNavigation(): void {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const path = pushPathFromResponse(response);
      if (!path) return;
      addBreadcrumb('navigation', 'push opened', { kind: String(response?.notification.request.content.data?.kind) });
      Notifications.clearLastNotificationResponse();
      pendingPath = path;
      router.push(path as Href);
    };
    open(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
