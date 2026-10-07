import { apiBaseUrl } from './api-base-url';
import type { AuthedFileKey, AuthedFileSource } from './authed-file-source';

/** The browser sends the session cookie and owns caching; the native file cache must not enter this bundle. */
export function useAuthedFileSource({ path }: AuthedFileKey): AuthedFileSource {
  return { kind: 'ready', uri: `${apiBaseUrl}${path}` };
}
