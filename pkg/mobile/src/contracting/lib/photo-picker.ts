import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'gallery';
export const PHOTO_QUALITY = 0.7;

/** One meter photo from the gallery with its EXIF, for Read At; null when the Foreman cancels. */
export async function chooseMeterPhoto(): Promise<{ uri: string; exif: Record<string, unknown> | null } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    exif: true,
    quality: PHOTO_QUALITY,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, exif: asset.exif ?? null } : null;
}
