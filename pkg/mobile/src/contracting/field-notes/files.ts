import * as FileSystem from 'expo-file-system/legacy';
import type { FieldNoteFiles } from './store';

const DIRECTORY = 'field-notes/';

/** Every photo is copied into the app's sandbox, which is what the note renders. */
export const fieldNoteFiles: FieldNoteFiles = {
  photoLimit: 12,
  async keep(sourceUri, noteId, photoId) {
    const documents = documentDirectory();
    const directory = `${documents}${DIRECTORY}${noteId}/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    await FileSystem.copyAsync({ from: sourceUri, to: `${directory}${photoId}.jpg` });
    // Sandbox-relative: iOS can move the data container between app versions while the files survive.
    return `${DIRECTORY}${noteId}/${photoId}.jpg`;
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

function documentDirectory(): string {
  if (!FileSystem.documentDirectory) throw new Error('Photo storage is unavailable on this device.');
  return FileSystem.documentDirectory;
}
