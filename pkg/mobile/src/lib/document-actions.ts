import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { apiBaseUrl } from './api-base-url';
import { sessionCookieHeader } from './auth';

/**
 * Download and share actions for the in-app document viewer (#521). This is the
 * native implementation (the `.web` sibling overrides it for the browser). Both
 * fetch with the same authed session cookie the tRPC client uses; the header is
 * passed straight to the platform downloader and never logged.
 */
export type DocumentAction = {
  /** Authed download route, e.g. `/api/jobs/:jobId/documents/:documentId/download`. */
  path: string;
  filename: string;
  /** Optional discriminator for callers that need more than the display name to identify cache bytes. */
  cacheKey?: string;
};

const PDF_MIME = 'application/pdf';

// Reduce a value to filesystem-safe characters for a cache filename. We can't
// percent-encode here: `cacheKey` is a download path, so its `/` would become
// `%2F`, which Expo decodes back to `/` when writing the `file://` target — writing
// into non-existent nested cache dirs and failing the download (and react-native-pdf
// can't open such a path). Collapse anything outside [A-Za-z0-9._-] to `_`.
const safeCacheSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '_');

// Fetch the document to the app cache with the session cookie, returning its file:// URI.
export async function downloadDocumentToCache({ path, filename, cacheKey }: DocumentAction): Promise<string> {
  const cookie = sessionCookieHeader();
  const cacheName = cacheKey
    ? `${safeCacheSegment(cacheKey)}-${safeCacheSegment(filename)}`
    : safeCacheSegment(filename);
  const target = `${FileSystem.cacheDirectory}${cacheName}`;
  const result = await FileSystem.downloadAsync(`${apiBaseUrl}${path}`, target, {
    headers: cookie ? { Cookie: cookie } : undefined,
  });

  if (result.status !== 200) {
    throw new Error(`Couldn’t download the document (${result.status}).`);
  }

  return result.uri;
}

/** Open the OS share sheet for the document (downloads it with auth first). */
export async function shareDocument(action: DocumentAction): Promise<void> {
  const uri = await downloadDocumentToCache(action);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing isn’t available on this device.');
  }

  await Sharing.shareAsync(uri, { mimeType: PDF_MIME, UTI: 'com.adobe.pdf', dialogTitle: action.filename });
}

/**
 * Save the document to the device. On Android the user picks a folder via the
 * Storage Access Framework and the bytes are written there; elsewhere there is no
 * public Downloads concept, so we fall back to the share sheet ("Save to Files").
 */
export async function saveDocument(action: DocumentAction): Promise<void> {
  const uri = await downloadDocumentToCache(action);

  if (Platform.OS !== 'android') {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Saving isn’t available on this device.');
    }
    await Sharing.shareAsync(uri, { mimeType: PDF_MIME, UTI: 'com.adobe.pdf', dialogTitle: action.filename });
    return;
  }

  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!permission.granted) {
    return; // User dismissed the folder picker — nothing to save.
  }

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
  const destination = await FileSystem.StorageAccessFramework.createFileAsync(
    permission.directoryUri,
    action.filename,
    PDF_MIME,
  );
  await FileSystem.writeAsStringAsync(destination, base64, { encoding: 'base64' });
}
