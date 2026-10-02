import * as FileSystem from 'expo-file-system/legacy';
import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import type { FieldNoteFiles } from './store';

const DIRECTORY = 'field-notes/';
export const GALLERY_ALBUM = 'Jedidiah';

/**
 * Every photo is copied into the app's sandbox, which is what the note renders. A photo the camera just
 * took also goes to the Jedidiah album so the capture screen can choose it later; one chosen from the
 * gallery is already there. A gallery failure is not an error: the note keeps its sandbox copy.
 */
export const fieldNoteFiles: FieldNoteFiles = {
  photoLimit: 12,
  async keep(sourceUri, noteId, photoId, source) {
    const documents = documentDirectory();
    const directory = `${documents}${DIRECTORY}${noteId}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: `${directory}${photoId}.jpg` });
    // Sandbox-relative: iOS can move the data container between app versions while the files survive.
    const uri = `${DIRECTORY}${noteId}/${photoId}.jpg`;
    const inGallery =
      source === 'gallery' ||
      (await saveToGalleryAlbum(sourceUri).then(
        () => true,
        () => false,
      ));
    return { uri, inGallery };
  },
  async removePhoto(uri) {
    await FileSystem.deleteAsync(resolveFieldNotePhotoUri(uri), { idempotent: true });
  },
  async removeNote(noteId) {
    await FileSystem.deleteAsync(resolveFieldNotePhotoUri(`${DIRECTORY}${noteId}/`), { idempotent: true });
  },
};

/** The stored key rebased onto today's document directory; anything outside `field-notes/` is refused. */
export function resolveFieldNotePhotoUri(key: string): string {
  if (!key.startsWith(DIRECTORY) || key.includes('..')) throw new Error('Not a Field Note photo.');
  return `${documentDirectory()}${key}`;
}

async function saveToGalleryAlbum(uri: string) {
  const { granted } = await requestPermissionsAsync(true, ['photo']);
  if (!granted) throw new Error('Photo library access denied.');
  const album = await Album.get(GALLERY_ALBUM);
  if (album) {
    await Asset.create(uri, album);
    return;
  }
  // Moving (not copying) the new asset into the album keeps one copy of it in the library on Android.
  await Album.create(GALLERY_ALBUM, [await Asset.create(uri)], true);
}

function documentDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error('Photo storage is unavailable on this device.');
  return FileSystem.documentDirectory;
}
