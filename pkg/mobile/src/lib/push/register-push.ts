import type { PushTokenRegisterInput, PushTokenUnregisterInput } from '@pkg/schema';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { addBreadcrumb, captureEvent } from '../observability';
import { hasAskedBefore, markAsked, readRegisteredToken, rememberRegisteredToken } from './push-storage';

export type PushRegistrationOutcome = 'registered' | 'denied' | 'unsupported';

/** The Android channel pushes ring on; which one is the business's call, so the caller names it. */
export type PushChannel = { id: string; name: string };

/**
 * Registers this install for pushes once the OS allows them. The OS prompt is shown at most once per user; after
 * that the phone's settings are the only way back, so a denial is never nagged about.
 */
export async function registerForPush({
  userId,
  channel,
  register,
}: {
  userId: string;
  channel: PushChannel;
  register: (input: PushTokenRegisterInput) => Promise<unknown>;
}): Promise<PushRegistrationOutcome> {
  if (!Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android')
    await Notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name,
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 250, 250, 250],
    });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && !(await hasAskedBefore(userId))) {
    await markAsked(userId);
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return 'denied';
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(typeof projectId === 'string' ? { projectId } : {});
  await register({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  await rememberRegisteredToken(token);
  return 'registered';
}

/** Forgets this install on the server before sign-out. Best effort: a failure never blocks signing out. */
export async function unregisterPush(unregister: (input: PushTokenUnregisterInput) => Promise<unknown>) {
  const token = await readRegisteredToken();
  if (!token) return;
  try {
    await unregister({ token });
    captureEvent('push token unregistered');
  } catch {
    addBreadcrumb('lifecycle', 'push token unregister failed');
  } finally {
    await rememberRegisteredToken(null);
  }
}
