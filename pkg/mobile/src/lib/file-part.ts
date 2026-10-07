import { File } from 'expo-file-system';

/**
 * A file on the phone as a multipart part, read straight from the camera's or recorder's URI. Expo's native fetch
 * accepts byte-backed File objects, not React Native's legacy `{ uri, name, type }` form part.
 */
export async function filePart(uri: string, missingMessage: string): Promise<Blob> {
  const file = new File(uri);
  if (!file.exists) throw new Error(missingMessage);
  return file;
}
