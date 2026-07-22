import { authedFetch } from './authed-fetch';

import type { DocumentAction } from './document-actions';

export type { DocumentAction } from './document-actions';

// On web the browser owns the cookie jar, so `authedFetch` carries the session
// automatically (credentials: 'include'); no header is read or logged here.
async function fetchBlobUrl({ path }: DocumentAction): Promise<string> {
  const response = await authedFetch(path);
  if (!response.ok) {
    throw new Error(`Couldn’t download the document (${response.status}).`);
  }
  return URL.createObjectURL(await response.blob());
}

// Trigger a browser download via a transient anchor, revoking the object URL after.
function triggerDownload(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

/** Web "share" has no native sheet here, so it downloads the file like Save does. */
export async function shareDocument(action: DocumentAction): Promise<void> {
  triggerDownload(await fetchBlobUrl(action), action.filename);
}

/** Save the document via a standard browser download. */
export async function saveDocument(action: DocumentAction): Promise<void> {
  triggerDownload(await fetchBlobUrl(action), action.filename);
}
