import { beforeEach, expect, test, vi } from 'vitest';

type PickerResult = { canceled: boolean; assets: { uri: string }[] };
const picker = vi.hoisted(() => ({
  requestCameraPermissionsAsync: vi.fn(async () => ({ granted: true })),
  launchCameraAsync: vi.fn(
    async (): Promise<PickerResult> => ({ canceled: false, assets: [{ uri: 'file:///camera/a.jpg' }] }),
  ),
  launchImageLibraryAsync: vi.fn(async (): Promise<PickerResult> => ({ canceled: true, assets: [] })),
}));
const gallery = vi.hoisted(() => {
  const albums = new Map<string, { title: string }>();
  return {
    albums,
    requestPermissionsAsync: vi.fn(async () => ({ granted: true })),
    Album: {
      get: vi.fn(async (title: string) => albums.get(title) ?? null),
      create: vi.fn(async (title: string) => {
        const album = { title };
        albums.set(title, album);
        return album;
      }),
    },
    Asset: { create: vi.fn(async (uri: string) => ({ uri })) },
  };
});
const platform = vi.hoisted(() => ({ OS: 'android' }));

vi.mock('expo-image-picker', () => picker);
vi.mock('expo-media-library', () => gallery);
vi.mock('react-native', () => ({ Platform: platform }));

import { choosePhotos, PhotoAccessError, takePhoto } from './photo-picker';

beforeEach(() => {
  vi.clearAllMocks();
  platform.OS = 'android';
  gallery.albums.clear();
});

test('a camera photo goes to the Jedidiah album, created the first time and appended to after', async () => {
  await expect(takePhoto()).resolves.toEqual([
    { uri: 'file:///camera/a.jpg', source: 'camera', exif: null, inGallery: true },
  ]);
  expect(gallery.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
  expect(gallery.Album.create).toHaveBeenCalledWith('Jedidiah', [{ uri: 'file:///camera/a.jpg' }], true);

  picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///camera/b.jpg' }] });
  await takePhoto();
  expect(gallery.Album.create).toHaveBeenCalledOnce();
  expect(gallery.Asset.create).toHaveBeenLastCalledWith('file:///camera/b.jpg', { title: 'Jedidiah' });
});

test('iOS asks for read-write access, since add-only access cannot find or create the album', async () => {
  platform.OS = 'ios';
  await takePhoto();
  expect(gallery.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);
});

test('a refused gallery still hands back the photo, marked as not in the gallery', async () => {
  gallery.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });

  await expect(takePhoto()).resolves.toMatchObject([{ uri: 'file:///camera/a.jpg', inGallery: false }]);
  expect(gallery.Asset.create).not.toHaveBeenCalled();
});

test('a cancelled camera is no photo, and a refused camera is the person’s own sentence', async () => {
  picker.launchCameraAsync.mockResolvedValueOnce({ canceled: true, assets: [] });
  await expect(takePhoto()).resolves.toEqual([]);

  picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false });
  await expect(takePhoto()).rejects.toBeInstanceOf(PhotoAccessError);
  expect(gallery.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('gallery photos are already in the gallery and never saved again', async () => {
  picker.launchImageLibraryAsync.mockResolvedValueOnce({
    canceled: false,
    assets: [{ uri: 'file:///gallery/1.jpg' }, { uri: 'file:///gallery/2.jpg' }, { uri: 'file:///gallery/3.jpg' }],
  });
  await expect(choosePhotos(2)).resolves.toEqual([
    { uri: 'file:///gallery/1.jpg', source: 'gallery', exif: null, inGallery: true },
    { uri: 'file:///gallery/2.jpg', source: 'gallery', exif: null, inGallery: true },
  ]);
  expect(gallery.requestPermissionsAsync).not.toHaveBeenCalled();

  await expect(choosePhotos(0)).resolves.toEqual([]);
  expect(picker.launchImageLibraryAsync).toHaveBeenCalledOnce();
});
