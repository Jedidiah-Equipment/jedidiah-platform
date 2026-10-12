import AsyncStorage from '@react-native-async-storage/async-storage';

import { addBreadcrumb } from '../observability';

// Per user, so a second person signing in on the same phone is asked for themselves.
const askedKey = (userId: string) => `push:asked:v1:${userId}`;
// Per phone: the install's token, kept so sign-out can forget it on the server.
const TOKEN_KEY = 'push:token:v1';

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

export async function readRegisteredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    addBreadcrumb('storage', 'push token read failed');
    return null;
  }
}

export async function rememberRegisteredToken(token: string | null): Promise<void> {
  try {
    if (token === null) await AsyncStorage.removeItem(TOKEN_KEY);
    else await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    addBreadcrumb('storage', 'push token write failed');
  }
}
