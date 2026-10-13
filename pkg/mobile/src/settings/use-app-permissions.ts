import { createUserAccessSummaryForUser, isPushRecipient } from '@pkg/domain';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuthSession } from '@/lib/auth-session';
import { addBreadcrumb } from '@/lib/observability';
import { useRequestNotifications } from '@/lib/push/use-push-registration';
import {
  APP_PERMISSION_KEYS,
  type AppPermissionKey,
  type AppPermissionReading,
  type AppPermissionRow,
  appPermissionRow,
} from './app-permission-rows';

// iOS needs read-write photo access to keep the Jedidiah album; Android saves through the system picker and an
// add-only album, so it has nothing here to ask for.
const PHOTO_ACCESS: [writeOnly: boolean, permissions: MediaLibrary.GranularPermission[]] = [false, ['photo']];

const READERS: Record<AppPermissionKey, () => Promise<AppPermissionReading>> = {
  notifications: () => (Device.isDevice ? Notifications.getPermissionsAsync() : Promise.resolve('unavailable')),
  camera: Camera.getCameraPermissionsAsync,
  microphone: getRecordingPermissionsAsync,
  location: Location.getForegroundPermissionsAsync,
  photos: () =>
    Platform.OS === 'ios' ? MediaLibrary.getPermissionsAsync(...PHOTO_ACCESS) : Promise.resolve('unavailable'),
};

const ASKERS: Record<Exclude<AppPermissionKey, 'notifications'>, () => Promise<unknown>> = {
  camera: Camera.requestCameraPermissionsAsync,
  microphone: requestRecordingPermissionsAsync,
  location: Location.requestForegroundPermissionsAsync,
  photos: () => MediaLibrary.requestPermissionsAsync(...PHOTO_ACCESS),
};

/**
 * The OS permissions the app uses, read on open and again whenever the app returns to the foreground, because the
 * person may have changed them in the phone's settings. Notifications are listed only for someone a Push Kind can
 * reach, the same people sign-in asks.
 */
export function useAppPermissions(): {
  rows: AppPermissionRow[];
  ask: (key: AppPermissionKey) => Promise<void>;
  openSettings: () => Promise<void>;
} {
  const { user } = useAuthSession();
  const isRecipient = useMemo(() => isPushRecipient(createUserAccessSummaryForUser(user)), [user]);
  const requestNotifications = useRequestNotifications();
  const [rows, setRows] = useState<AppPermissionRow[]>([]);

  const refresh = useCallback(async () => {
    const keys = APP_PERMISSION_KEYS.filter((key) => key !== 'notifications' || isRecipient);
    const readings = await Promise.all(
      keys.map((key) => READERS[key]().catch((): AppPermissionReading => 'unavailable')),
    );
    setRows(keys.flatMap((key, index) => appPermissionRow(key, readings[index]) ?? []));
  }, [isRecipient]);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const ask = useCallback(
    async (key: AppPermissionKey) => {
      try {
        await (key === 'notifications' ? requestNotifications() : ASKERS[key]());
      } catch {
        addBreadcrumb('lifecycle', 'permission ask failed', { permission: key });
      }
      await refresh();
    },
    [refresh, requestNotifications],
  );

  return { rows, ask, openSettings: Linking.openSettings };
}
