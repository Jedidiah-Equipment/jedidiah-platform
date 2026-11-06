import { apiBaseUrl } from './api-base-url';
import type { AuthedFileKey, AuthedFileSource } from './authed-file-source';

/** The browser sends the session cookie and owns caching; the native file cache must not enter this bundle. */
const webSource = ({ path }: AuthedFileKey): AuthedFileSource => ({ kind: 'ready', uri: `${apiBaseUrl}${path}` });

export function useAuthedFileSource(key: AuthedFileKey): AuthedFileSource {
  return webSource(key);
}

const retry = () => undefined;

export function useAuthedFileSources(keys: readonly AuthedFileKey[]): {
  sources: AuthedFileSource[];
  retry: () => void;
} {
  return { sources: keys.map(webSource), retry };
}
