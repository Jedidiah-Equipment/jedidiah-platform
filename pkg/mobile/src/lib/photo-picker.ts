import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { saveToGallery } from './photo-album';

export { saveToGallery };

export type PhotoSource = 'camera' | 'gallery';
export const PHOTO_QUALITY = 0.7;

/**
 * A photo just taken or chosen, still at the camera's or the gallery's own URI. `exif` comes only with a gallery
 * photo; `inGallery` is false for a camera photo the Jedidiah album would not take.
 */
export type PickedPhoto = {
  uri: string;
  source: PhotoSource;
  exif: Record<string, unknown> | null;
  inGallery: boolean;
};

/** The person or the OS kept the picker closed; the message is theirs to read, not a device failure to report. */
export class PhotoAccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PhotoAccessError';
  }
}

// The web preview keeps photos inside the stored value, so it needs the bytes rather than a blob: URL.
const base64 = Platform.OS === 'web';

function pickedUri(asset: ImagePicker.ImagePickerAsset): string {
  if (Platform.OS === 'web' && asset.base64) return `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`;
  return asset.uri;
}

/** One photo from the gallery with its EXIF, for when it was taken; null when the person cancels. */
export async function choosePhoto(): Promise<PickedPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    exif: true,
    quality: PHOTO_QUALITY,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, source: 'gallery', exif: asset.exif ?? null, inGallery: true } : null;
}

/**
 * One photo from the system camera, asking only for the camera, and put in the Jedidiah album so the person finds
 * it again; none when they cancel. A gallery refusal is not an error: the photo is still theirs to use.
 */
export async function takePhoto(): Promise<PickedPhoto[]> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted)
    throw new PhotoAccessError('Camera permission is unavailable. Choose a photo from the gallery instead.');
  const result = await ImagePicker.launchCameraAsync({ quality: PHOTO_QUALITY, base64 });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return [];
  const uri = pickedUri(asset);
  const inGallery = await saveToGallery(uri).then(
    () => true,
    () => false,
  );
  return [{ uri, source: 'camera', exif: null, inGallery }];
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
  return result.assets
    .slice(0, limit)
    .map((asset) => ({ uri: pickedUri(asset), source: 'gallery', exif: null, inGallery: true }));
}
