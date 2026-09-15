import { File } from 'expo-file-system';
import { expect, test, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  File: class File {
    constructor(readonly uri: string) {}

    bytes() {
      return Promise.resolve(new Uint8Array());
    }
  },
}));
vi.mock('expo-file-system/legacy', () => ({}));

import { readReadingPhotoPart } from './reading-files';

test('a saved native photo becomes the File object Expo fetch requires for multipart uploads', async () => {
  const photo = await readReadingPhotoPart('file:///readings/meter.jpg');

  expect(photo).toBeInstanceOf(File);
  expect(photo).toMatchObject({ uri: 'file:///readings/meter.jpg' });
  expect('bytes' in photo).toBe(true);
});
