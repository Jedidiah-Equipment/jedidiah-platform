import { File } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';

export async function keepReadingPhoto(uri: string, localId: string): Promise<string> {
  if (!FileSystem.documentDirectory) throw new Error('Photo storage is unavailable on this device.');
  const directory = `${FileSystem.documentDirectory}readings/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${localId}.jpg`;
  await FileSystem.copyAsync({ from: uri, to: destination });
  return destination;
}
export async function removeReadingPhoto(uri: string) {
  await FileSystem.deleteAsync(uri, { idempotent: true });
}
/** Expo's native fetch accepts byte-backed File objects, not React Native's legacy `{ uri }` form part. */
export async function readReadingPhotoPart(uri: string): Promise<Blob> {
  return new File(uri);
}
