import { Album, Asset, requestPermissionsAsync } from 'expo-media-library';
import { Platform } from 'react-native';

const GALLERY_ALBUM = 'Jedidiah';

/** Puts a photo the camera just took into the Jedidiah album; throws when the library is unavailable. */
export async function saveToGallery(uri: string): Promise<void> {
  // iOS's add-only access cannot find or create an album, so the album needs read-write there.
  const { granted } = await requestPermissionsAsync(Platform.OS !== 'ios', ['photo']);
  if (!granted) throw new Error('Photo library access denied.');
  const album = await Album.get(GALLERY_ALBUM);
  if (album) {
    await Asset.create(uri, album);
    return;
  }
  // Moving (not copying) the new asset into the album keeps one copy of it in the library on Android.
  await Album.create(GALLERY_ALBUM, [await Asset.create(uri)], true);
}
