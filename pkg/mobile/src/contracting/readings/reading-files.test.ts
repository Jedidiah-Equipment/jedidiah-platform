import { File } from 'expo-file-system';
import { beforeEach, expect, test, vi } from 'vitest';

const files = vi.hoisted(() => new Set<string>());
const fileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system', () => ({
  File: class File {
    constructor(readonly uri: string) {}

    get exists() {
      return files.has(this.uri);
    }

    bytes() {
      return Promise.resolve(new Uint8Array());
    }
  },
}));
vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///current/Documents/',
  ...fileSystem,
}));

import { keepReadingPhoto, ReadingPhotoUnavailableError, readReadingPhotoPart } from './reading-files';

beforeEach(() => {
  files.clear();
  vi.clearAllMocks();
});

test('a saved native photo becomes the File object Expo fetch requires for multipart uploads', async () => {
  files.add('file:///current/Documents/readings/meter.jpg');
  const photo = await readReadingPhotoPart('readings/meter.jpg');

  expect(photo).toBeInstanceOf(File);
  expect(photo).toMatchObject({ uri: 'file:///current/Documents/readings/meter.jpg' });
  expect('bytes' in photo).toBe(true);
});

test('rebases a queued absolute photo URI after the iOS data container moves', async () => {
  files.add('file:///current/Documents/readings/capture.jpg');

  const photo = await readReadingPhotoPart('file:///old-container/Documents/readings/capture.jpg');

  expect(photo).toMatchObject({ uri: 'file:///current/Documents/readings/capture.jpg' });
});

test('reports a missing retained photo explicitly', async () => {
  await expect(readReadingPhotoPart('readings/missing.jpg')).rejects.toBeInstanceOf(ReadingPhotoUnavailableError);
});

test('stores a stable relative key after retaining a camera photo', async () => {
  await expect(keepReadingPhoto('file:///camera/photo.jpg', 'capture-1')).resolves.toBe('readings/capture-1.jpg');
  expect(fileSystem.copyAsync).toHaveBeenCalledWith({
    from: 'file:///camera/photo.jpg',
    to: 'file:///current/Documents/readings/capture-1.jpg',
  });
});
