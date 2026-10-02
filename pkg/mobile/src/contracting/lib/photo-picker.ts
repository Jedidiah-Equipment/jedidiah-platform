import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { FieldNoteError, type PickedPhoto } from '@/contracting/field-notes/store';

const QUALITY = 0.7;
// The web preview keeps photos inside the stored value, so it needs the bytes rather than a blob: URL.
const base64 = Platform.OS === 'web';

function pickedUri(asset: ImagePicker.ImagePickerAsset): string {
  if (Platform.OS === 'web' && asset.base64) return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  return asset.uri;
}

/** One photo from the system camera, asking only for the camera; null when the Foreman cancels. */
export async function takePhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new FieldNoteError('Camera permission is unavailable. Choose a photo from the gallery instead.');
  const result = await ImagePicker.launchCameraAsync({ quality: QUALITY, base64 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: pickedUri(asset), source: 'camera' } : null;
}

/** Up to `limit` photos from the system picker, which needs no library permission. */
export async function choosePhotos(limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: QUALITY,
    base64,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({ uri: pickedUri(asset), source: 'gallery' }));
}

/** One meter photo from the gallery with its EXIF, for Read At; null when the Foreman cancels. */
export async function chooseMeterPhoto(): Promise<{ uri: string; exif: Record<string, unknown> | null } | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], exif: true, quality: QUALITY });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, exif: asset.exif ?? null } : null;
}
