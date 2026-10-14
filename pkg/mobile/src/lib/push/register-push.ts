import type { PushChannel } from '@pkg/domain';
import type { PushTokenRegisterInput } from '@pkg/schema';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { hasAskedBefore, markAsked } from './push-storage';

export type PushRegistrationOutcome = 'registered' | 'denied' | 'unsupported';

const androidImportance: Record<PushChannel['importance'], Notifications.AndroidImportance> = {
  max: Notifications.AndroidImportance.MAX,
  default: Notifications.AndroidImportance.DEFAULT,
};

type Registration = {
  userId: string;
  /** The Android channels the signed-in person's Push Kinds ring on. */
  channels: readonly PushChannel[];
  register: (input: PushTokenRegisterInput) => Promise<unknown>;
};

async function claimInstall({
  channels,
  register,
  shouldAsk,
}: Omit<Registration, 'userId'> & { shouldAsk: () => Promise<boolean> }): Promise<PushRegistrationOutcome> {
  if (!Device.isDevice) return 'unsupported';
  if (Platform.OS === 'android')
    for (const channel of channels)
      await Notifications.setNotificationChannelAsync(channel.id, {
        name: channel.name,
        importance: androidImportance[channel.importance],
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
      });
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted' && (await shouldAsk())) ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== 'granted') return 'denied';
  const projectId: unknown = Constants.expoConfig?.extra?.eas?.projectId;
  const { data: token } = await Notifications.getExpoPushTokenAsync(typeof projectId === 'string' ? { projectId } : {});
  await register({ token, platform: Platform.OS === 'ios' ? 'ios' : 'android' });
  return 'registered';
}

/**
 * Registers this install for whoever signed in, once the OS allows pushes, so the server re-points it from the last
 * user. Only a user who `mayAsk` (a push recipient) is shown the OS prompt, and at most once; after that App Settings
 * or the phone's settings are the only way back, so a denial is never nagged about. Nothing unregisters: the server
 * drops the registration with the session that made it.
 */
export function registerForPush({
  mayAsk,
  userId,
  ...registration
}: Registration & { mayAsk: boolean }): Promise<PushRegistrationOutcome> {
  return claimInstall({
    ...registration,
    shouldAsk: async () => {
      if (!mayAsk || (await hasAskedBefore(userId))) return false;
      await markAsked(userId);
      return true;
    },
  });
}

/** App Settings' Allow: shows the OS prompt whenever the OS still offers it, then claims the install as sign-in does. */
export function requestNotificationsAndRegister({
  userId,
  ...registration
}: Registration): Promise<PushRegistrationOutcome> {
  return claimInstall({
    ...registration,
    shouldAsk: async () => {
      await markAsked(userId);
      return true;
    },
  });
}
