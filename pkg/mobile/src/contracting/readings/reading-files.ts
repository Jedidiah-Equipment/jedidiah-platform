import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { ReadingPhotoUnavailableError } from './reading-photo-error';

export { ReadingPhotoUnavailableError } from './reading-photo-error';

const READING_DIRECTORY = 'readings/';

export async function keepReadingPhoto(uri: string, localId: string): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('Photo storage is unavailable on this device.');
  const directory = `${FileSystem.documentDirectory}${READING_DIRECTORY}`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${localId}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  // Persist a sandbox-relative key. iOS can move the application's data container between app
  // versions, which makes an absolute documentDirectory URI stale while the file itself survives.
  return `${READING_DIRECTORY}${localId}.jpg`;
}
export async function removeReadingPhoto(uri: string) {
  await FileSystem.deleteAsync(resolveReadingPhotoUri(uri), { idempotent: true });
}
/** Expo's native fetch accepts byte-backed File objects, not React Native's legacy `{ uri }` form part. */
export async function readReadingPhotoPart(uri: string): Promise<Blob> {
  const photo = new File(resolveReadingPhotoUri(uri));
  if (!photo.exists) throw new ReadingPhotoUnavailableError();
  return photo;
}

/**
 * Rebase old absolute queue entries onto today's document container. The filename is the queue's
 * client-generated id, so no user-controlled path segments are retained.
 */
function resolveReadingPhotoUri(saved: string): string {
  if (!FileSystem.documentDirectory) throw new Error('Photo storage is unavailable on this device.');
  const marker = `/${READING_DIRECTORY}`;
  const markerAt = saved.lastIndexOf(marker);
  const relative = markerAt >= 0 ? saved.slice(markerAt + 1) : saved;
  if (!relative.startsWith(READING_DIRECTORY) || relative.includes('..')) throw new ReadingPhotoUnavailableError();
  return `${FileSystem.documentDirectory}${relative}`;
}
