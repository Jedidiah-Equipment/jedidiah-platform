import AsyncStorage from '@react-native-async-storage/async-storage';

import { addBreadcrumb } from '../observability';

// Per user, so a second person signing in on the same phone is asked for themselves.
const askedKey = (userId: string) => `push:asked:v1:${userId}`;

/** Whether the OS prompt was already shown for this user on this phone; the prompt is offered once, ever. */
export async function hasAskedBefore(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(askedKey(userId))) !== null;
  } catch {
    addBreadcrumb('storage', 'push asked read failed');
    return false;
  }
}

export async function markAsked(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(askedKey(userId), new Date().toISOString());
  } catch {
    addBreadcrumb('storage', 'push asked write failed');
  }
}
