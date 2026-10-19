import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { Camera } from 'expo-camera';
import * as Device from 'expo-device';
import * as Linking from 'expo-linking';
import * as Location from 'expo-location';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { addBreadcrumb } from '@/lib/observability';
import { usePushAudience, useRequestNotifications } from '@/lib/push/use-push-registration';
import {
  APP_PERMISSION_KEYS,
  type AppPermissionKey,
  type AppPermissionReading,
  type AppPermissionRow,
  type AppPermissions,
  appPermissionRow,
} from './app-permission-rows';

// iOS needs read-write photo access to keep the Jedidiah album; Android saves through the system picker and an
// add-only album, so it has nothing here to ask for.
const PHOTO_ACCESS: [writeOnly: boolean, permissions: MediaLibrary.GranularPermission[]] = [false, ['photo']];

type PermissionSource = { read: () => Promise<AppPermissionReading>; ask: () => Promise<unknown> };

const CAMERA: PermissionSource = { read: Camera.getCameraPermissionsAsync, ask: Camera.requestCameraPermissionsAsync };
const MICROPHONE: PermissionSource = { read: getRecordingPermissionsAsync, ask: requestRecordingPermissionsAsync };
const LOCATION: PermissionSource = {
  read: Location.getForegroundPermissionsAsync,
  ask: Location.requestForegroundPermissionsAsync,
};
const PHOTOS: PermissionSource = {
  read: () =>
    Platform.OS === 'ios' ? MediaLibrary.getPermissionsAsync(...PHOTO_ACCESS) : Promise.resolve('unavailable'),
  ask: () => MediaLibrary.requestPermissionsAsync(...PHOTO_ACCESS),
};

/**
 * The OS permissions the app uses, read on open and again whenever the app returns to the foreground, because the
 * person may have changed them in the phone's settings. Notifications are listed only for someone a Push Kind can
 * reach, the same people sign-in asks; for anyone else the row reads unavailable and `appPermissionRow` drops it.
 */
export function useAppPermissions(): AppPermissions {
  const { mayAsk: isRecipient } = usePushAudience();
  const requestNotifications = useRequestNotifications();
  const [rows, setRows] = useState<AppPermissionRow[]>([]);

  const sources = useMemo<Record<AppPermissionKey, PermissionSource>>(
    () => ({
      notifications: {
        read: () =>
          isRecipient && Device.isDevice ? Notifications.getPermissionsAsync() : Promise.resolve('unavailable'),
        ask: requestNotifications,
      },
      camera: CAMERA,
      microphone: MICROPHONE,
      location: LOCATION,
      photos: PHOTOS,
    }),
    [isRecipient, requestNotifications],
  );

  const refresh = useCallback(async () => {
    const readings = await Promise.all(
      APP_PERMISSION_KEYS.map((key) => sources[key].read().catch((): AppPermissionReading => 'unavailable')),
    );
    setRows(APP_PERMISSION_KEYS.flatMap((key, index) => appPermissionRow(key, readings[index]) ?? []));
  }, [sources]);

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
        await sources[key].ask();
      } catch {
        addBreadcrumb('lifecycle', 'permission ask failed', { permission: key });
      }
      await refresh();
    },
    [refresh, sources],
  );

  return { rows, ask, openSettings: Linking.openSettings };
}
