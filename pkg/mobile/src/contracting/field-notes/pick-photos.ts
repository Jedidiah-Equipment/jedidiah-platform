import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { PHOTO_QUALITY } from '@/contracting/lib/photo-picker';
import { FieldNoteError, type PickedPhoto } from './store';

// The web preview keeps photos inside the stored value, so it needs the bytes rather than a blob: URL.
const base64 = Platform.OS === 'web';

function pickedUri(asset: ImagePicker.ImagePickerAsset): string {
  if (Platform.OS === 'web' && asset.base64) return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  return asset.uri;
}

/** One photo from the system camera, asking only for the camera; none when the Foreman cancels. */
export async function takePhoto(): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new FieldNoteError('Camera permission is unavailable. Choose a photo from the gallery instead.');
  const result = await ImagePicker.launchCameraAsync({ quality: PHOTO_QUALITY, base64 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? [{ uri: pickedUri(asset), source: 'camera' }] : [];
}

/** Up to `limit` photos from the system picker, which needs no library permission. */
export async function choosePhotos(limit: number): Promise<PickedPhoto[]> {
  if (limit <= 0) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    quality: PHOTO_QUALITY,
    base64,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, limit).map((asset) => ({ uri: pickedUri(asset), source: 'gallery' }));
}
