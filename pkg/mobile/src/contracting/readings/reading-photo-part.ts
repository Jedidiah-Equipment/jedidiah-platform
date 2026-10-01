import { File } from 'expo-file-system';

/**
 * The meter photo as a multipart part, read straight from the camera's temporary URI. Expo's native fetch
 * accepts byte-backed File objects, not React Native's legacy `{ uri, name, type }` form part.
 */
export async function readingPhotoPart(uri: string): Promise<Blob> {
  const file = new File(uri);
  if (!file.exists) throw new Error('The photo is no longer available. Retake it.');
  return file;
}
