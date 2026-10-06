import { File } from 'expo-file-system';

/** The recording as a multipart part, read from the recorder's file. Expo's fetch takes byte-backed Files. */
export async function audioPart(uri: string): Promise<Blob> {
  const file = new File(uri);
  if (!file.exists) throw new Error('The recording is no longer available. Record it again.');
  return file;
}
