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
 * Registers this install for whoever signed in, once the OS allows pushes, so the server re-points it from the last
 * user. Only a user who `mayAsk` (a push recipient) is shown the OS prompt, and at most once; after that the phone's
 * settings are the only way back, so a denial is never nagged about.
 */
export async function registerForPush({
  userId,
  channel,
  mayAsk,
  register,
}: {
  userId: string;
  channel: PushChannel;
  mayAsk: boolean;
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
  if (status !== 'granted' && mayAsk && !(await hasAskedBefore(userId))) {
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

const UNREGISTER_TIMEOUT_MS = 5_000;

/** Forgets this install on the server before sign-out. Best effort: a failure or a slow network never blocks it. */
export async function unregisterPush(unregister: (input: PushTokenUnregisterInput) => Promise<unknown>) {
  const token = await readRegisteredToken();
  if (!token) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      unregister({ token }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Push unregister timed out')), UNREGISTER_TIMEOUT_MS);
      }),
    ]);
    captureEvent('push token unregistered');
  } catch {
    addBreadcrumb('lifecycle', 'push token unregister failed');
  } finally {
    clearTimeout(timer);
    await rememberRegisteredToken(null);
  }
}
