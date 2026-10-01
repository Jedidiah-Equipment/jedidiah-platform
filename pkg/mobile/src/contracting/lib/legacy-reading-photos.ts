import * as FileSystem from 'expo-file-system/legacy';

/** The sandbox folder the retired reading queue copied meter photos into. */
export async function removeLegacyReadingPhotos(): Promise<void> {
  if (FileSystem.documentDirectory)
    await FileSystem.deleteAsync(`${FileSystem.documentDirectory}readings/`, { idempotent: true });
}
