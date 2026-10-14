import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, expect, test, vi } from 'vitest';

const notifications = vi.hoisted(() => ({
  AndroidImportance: { MAX: 5, DEFAULT: 3 },
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
vi.mock('../observability', () => ({ addBreadcrumb: vi.fn() }));

import { registerForPush, requestNotificationsAndRegister } from './register-push';

const channels = [
  { id: 'workshop', name: 'Workshop' },
  { id: 'notes', name: 'Notes' },
];

beforeEach(async () => {
  vi.clearAllMocks();
  device.isDevice = true;
  await AsyncStorage.clear();
});

test('a denial is asked once per user and never again', async () => {
  const register = vi.fn(async () => undefined);

  expect(await registerForPush({ userId: 'wendy', channels, mayAsk: true, register })).toBe('denied');
  expect(await registerForPush({ userId: 'wendy', channels, mayAsk: true, register })).toBe('denied');
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);

  await registerForPush({ userId: 'mo', channels, mayAsk: true, register });
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(register).not.toHaveBeenCalled();
});

test('someone no push reaches is never asked, but still claims an install the OS already allows', async () => {
  const register = vi.fn(async () => undefined);

  expect(await registerForPush({ userId: 'sipho', channels, mayAsk: false, register })).toBe('denied');
  expect(notifications.requestPermissionsAsync).not.toHaveBeenCalled();

  notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
  expect(await registerForPush({ userId: 'sipho', channels, mayAsk: false, register })).toBe('registered');
  expect(register).toHaveBeenCalledWith({ token: 'ExponentPushToken[phone]', platform: 'android' });
});

test('a granted permission creates separate workshop and notes channels', async () => {
  notifications.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });
  const register = vi.fn(async () => undefined);

  expect(await registerForPush({ userId: 'wendy', channels, mayAsk: true, register })).toBe('registered');
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'workshop',
    expect.objectContaining({ importance: 5 }),
  );
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'notes',
    expect.objectContaining({ importance: 3 }),
  );
  expect(register).toHaveBeenCalledWith({ token: 'ExponentPushToken[phone]', platform: 'android' });
});

test('Allow on the Settings page asks again whenever the OS still can, then registers', async () => {
  const register = vi.fn(async () => undefined);
  await registerForPush({ userId: 'wendy', channels, mayAsk: true, register });
  notifications.requestPermissionsAsync.mockResolvedValueOnce({ status: 'granted' });

  expect(await requestNotificationsAndRegister({ userId: 'wendy', channels, register })).toBe('registered');
  expect(notifications.requestPermissionsAsync).toHaveBeenCalledTimes(2);
  expect(register).toHaveBeenCalledWith({ token: 'ExponentPushToken[phone]', platform: 'android' });
});

test('a simulator has no push channel and is never prompted', async () => {
  device.isDevice = false;

  expect(await registerForPush({ userId: 'wendy', channels, mayAsk: true, register: vi.fn() })).toBe('unsupported');
  expect(notifications.getPermissionsAsync).not.toHaveBeenCalled();
});
