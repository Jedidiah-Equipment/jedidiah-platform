import { beforeEach, expect, test, vi } from 'vitest';

const fileSystem = vi.hoisted(() => ({
  copyAsync: vi.fn(async () => undefined),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
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

vi.mock('expo-file-system/legacy', () => ({ documentDirectory: 'file:///current/Documents/', ...fileSystem }));
vi.mock('expo-media-library', () => gallery);
const platform = vi.hoisted(() => ({ OS: 'android' }));
vi.mock('react-native', () => ({ Platform: platform }));

import { fieldNoteFiles, resolveFieldNotePhotoUri } from './files';

beforeEach(() => {
  vi.clearAllMocks();
  platform.OS = 'android';
  gallery.albums.clear();
});

test('copies a photo into the note’s sandbox folder and stores the sandbox-relative key', async () => {
  const kept = await fieldNoteFiles.keep('file:///picker/a.jpg', 'note-1', 'photo-1', 'gallery');

  expect(fileSystem.makeDirectoryAsync).toHaveBeenCalledWith('file:///current/Documents/field-notes/note-1/', {
    intermediates: true,
  });
  expect(fileSystem.copyAsync).toHaveBeenCalledWith({
    from: 'file:///picker/a.jpg',
    to: 'file:///current/Documents/field-notes/note-1/photo-1.jpg',
  });
  expect(kept).toEqual({ uri: 'field-notes/note-1/photo-1.jpg', inGallery: true });
});

test('a gallery photo is not saved to the library again', async () => {
  await fieldNoteFiles.keep('file:///picker/a.jpg', 'note-1', 'photo-1', 'gallery');

  expect(gallery.requestPermissionsAsync).not.toHaveBeenCalled();
  expect(gallery.Asset.create).not.toHaveBeenCalled();
});

test('a camera photo goes to the Jedidiah album, created the first time and appended to after', async () => {
  await fieldNoteFiles.keep('file:///camera/a.jpg', 'note-1', 'photo-1', 'camera');
  expect(gallery.requestPermissionsAsync).toHaveBeenCalledWith(true, ['photo']);
  expect(gallery.Album.create).toHaveBeenCalledWith('Jedidiah', [{ uri: 'file:///camera/a.jpg' }], true);

  await fieldNoteFiles.keep('file:///camera/b.jpg', 'note-1', 'photo-2', 'camera');
  expect(gallery.Album.create).toHaveBeenCalledOnce();
  expect(gallery.Asset.create).toHaveBeenLastCalledWith('file:///camera/b.jpg', { title: 'Jedidiah' });
});

test('iOS asks for read-write access, since add-only access cannot find or create the album', async () => {
  platform.OS = 'ios';
  await fieldNoteFiles.keep('file:///camera/a.jpg', 'note-1', 'photo-1', 'camera');
  expect(gallery.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);
});

test('a refused gallery keeps the sandbox copy and reports the photo as not in the gallery', async () => {
  gallery.requestPermissionsAsync.mockResolvedValueOnce({ granted: false });

  const kept = await fieldNoteFiles.keep('file:///camera/a.jpg', 'note-1', 'photo-1', 'camera');

  expect(fileSystem.copyAsync).toHaveBeenCalledOnce();
  expect(gallery.Asset.create).not.toHaveBeenCalled();
  expect(kept).toEqual({ uri: 'field-notes/note-1/photo-1.jpg', inGallery: false });
});

test('removing a note deletes its folder and never touches the gallery', async () => {
  await fieldNoteFiles.removeNote('note-1');

  expect(fileSystem.deleteAsync).toHaveBeenCalledWith('file:///current/Documents/field-notes/note-1/', {
    idempotent: true,
  });
  expect(gallery.requestPermissionsAsync).not.toHaveBeenCalled();
});

test('resolves only keys inside the Field Note folder', () => {
  expect(resolveFieldNotePhotoUri('field-notes/note-1/photo-1.jpg')).toBe(
    'file:///current/Documents/field-notes/note-1/photo-1.jpg',
  );
  expect(() => resolveFieldNotePhotoUri('field-notes/../readings/x.jpg')).toThrow();
  expect(() => resolveFieldNotePhotoUri('readings/x.jpg')).toThrow();
});
