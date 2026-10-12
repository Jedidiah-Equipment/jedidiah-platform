import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test, vi } from 'vitest';

const notifications = vi.hoisted(() => ({
  AndroidImportance: { MAX: 5 },
  setNotificationChannelAsync: vi.fn(async () => null),
  getPermissionsAsync: vi.fn(async () => ({ status: 'undetermined' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'denied' })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'ExponentPushToken[phone]' })),
}));
const device = vi.hoisted(() => ({ isDevice: true }));

vi.mock('expo-notifications', () => notifications);
vi.mock('expo-device', () => device);
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'project' } } } } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));
vi.mock('../observability', () => ({ addBreadcrumb: vi.fn(), captureEvent: vi.fn() }));

import { registerForPush, unregisterPush } from './register-push';

const channel = { id: 'workshop', name: 'Workshop' };

beforeEach(async () => {
  vi.clearAllMocks();
  device.isDevice = true;
  await AsyncStorage.clear();
});

test('a denial is asked once per user and never again', async () => {
  const register = vi.fn(async () => undefined);

  expect(await registerForPush({ userId: 'wendy', channel, register })).toBe('denied');
  expect(await registerForPush({ userId: 'wendy', channel, register })).toBe('denied');
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);

  await registerForPush({ userId: 'mo', channel, register });
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(register).not.toHaveBeenCalled();
});

test('a granted permission registers the install on the workshop channel, then sign-out forgets it', async () => {
  notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
  const register = vi.fn(async () => undefined);
  const unregister = vi.fn(async () => undefined);

  expect(await registerForPush({ userId: 'wendy', channel, register })).toBe('registered');
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'workshop',
    expect.objectContaining({ importance: 5 }),
  );
  expect(register).toHaveBeenCalledWith({ token: 'ExponentPushToken[phone]', platform: 'android' });

  await unregisterPush(unregister);
  await unregisterPush(unregister);
  expect(unregister.mock.calls).toEqual([[{ token: 'ExponentPushToken[phone]' }]]);
});

test('a simulator has no push channel and is never prompted', async () => {
  device.isDevice = false;

  expect(await registerForPush({ userId: 'wendy', channel, register: vi.fn() })).toBe('unsupported');
  expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
});
