import AsyncStorage from '@react-native-async-storage/async-storage';
import { expect, test, vi } from 'vitest';

const photos = vi.hoisted(() => ({ removeLegacyReadingPhotos: vi.fn(async () => {}) }));
vi.mock('./legacy-reading-photos', () => photos);
vi.mock('@/lib/observability', () => ({ captureSanitizedException: vi.fn() }));

import { purgeLegacyContractingStorage } from './purge-legacy-storage';

test('removes the old queue and saved fleet and Jobs once, keeping the Machines list preferences', async () => {
  await AsyncStorage.setMany({
    'contracting:readings:v1:https://api.test:user-1': '[]',
    'contracting:fleet:v3:https://api.test:user-1:machines': '[]',
    'contracting:fleet:v2:https://api.test:user-1:drivers': '[]',
    'contracting:jobs:v1:https://api.test:user-1': '[]',
    'contracting:machines:category': '"all"',
    'contracting:machines:sort': '"code"',
    'color-mode': '"dark"',
  });

  await purgeLegacyContractingStorage();
  expect([...(await AsyncStorage.getAllKeys())].sort()).toEqual([
    'color-mode',
    'contracting:machines:category',
    'contracting:machines:sort',
  ]);
  expect(photos.removeLegacyReadingPhotos).toHaveBeenCalledOnce();

  await AsyncStorage.setItem('contracting:jobs:v1:https://api.test:user-2', '[]');
  await purgeLegacyContractingStorage();
  expect(await AsyncStorage.getItem('contracting:jobs:v1:https://api.test:user-2')).toBe('[]');
  expect(photos.removeLegacyReadingPhotos).toHaveBeenCalledOnce();
});
