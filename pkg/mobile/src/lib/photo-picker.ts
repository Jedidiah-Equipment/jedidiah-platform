import * as ImagePicker from 'expo-image-picker';

export type PhotoSource = 'camera' | 'gallery';
export const PHOTO_QUALITY = 0.7;

/** One photo from the gallery with its EXIF, for when it was taken; null when the person cancels. */
export async function choosePhoto(): Promise<{ uri: string; exif: Record<string, unknown> | null } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    exif: true,
    quality: PHOTO_QUALITY,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, exif: asset.exif ?? null } : null;
}
