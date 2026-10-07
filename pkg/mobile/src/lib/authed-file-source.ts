import { Directory, File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { authedFetch } from './authed-fetch';
import { captureSanitizedException } from './observability';

export type AuthedFileSource = { kind: 'failed' | 'loading' } | { kind: 'ready'; uri: string };

export type AuthedFileKey = {
  /** The folder under the OS cache directory, e.g. `product-images`. */
  cacheDir: string;
  /** The file's name in that folder; the key must change whenever the bytes behind `path` may have. */
  cacheName: string;
  /** The authed API path that serves the bytes. */
  path: string;
  /** What the file is, for the failure report, e.g. `Product image`. */
  label: string;
};

const inFlight = new Map<string, Promise<string>>();

/**
 * A file behind the session cookie as a displayable URI: downloaded once into the OS cache, then served from there.
 * The web build overrides this with the API URL, since the browser sends the cookie and owns caching.
 */
export function useAuthedFileSource(key: AuthedFileKey): AuthedFileSource {
  const [source, setSource] = useState<AuthedFileSource>({ kind: 'loading' });
  const { cacheDir, cacheName, path, label } = key;

  useEffect(() => {
    let active = true;
    resolveFileUri({ cacheDir, cacheName, path, label })
      .then((uri) => {
        if (active) setSource({ kind: 'ready', uri });
      })
      .catch((error) => {
        captureSanitizedException(error, `${label} loading failed`, { source: 'authed_file', cacheDir });
        if (active) setSource({ kind: 'failed' });
      });
    return () => {
      active = false;
    };
  }, [cacheDir, cacheName, path, label]);

  return source;
}

async function resolveFileUri(key: AuthedFileKey): Promise<string> {
  const directory = new Directory(Paths.cache, key.cacheDir);
  const target = new File(directory, key.cacheName);
  if (target.exists) return target.uri;

  const pending = inFlight.get(target.uri);
  if (pending) return pending;

  const request = fetchFile(key, directory, target).finally(() => {
    inFlight.delete(target.uri);
  });
  inFlight.set(target.uri, request);
  return request;
}

async function fetchFile(key: AuthedFileKey, directory: Directory, target: File): Promise<string> {
  directory.create({ idempotent: true, intermediates: true });
  // Another native caller may have completed the atomic move before this request acquired the in-memory entry.
  if (target.exists) return target.uri;

  const response = await authedFetch(key.path);
  if (!response.ok) throw new Error(`Couldn’t download the ${key.label} (${response.status}).`);

  const temporary = new File(directory, `${target.name}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
  try {
    temporary.create({ intermediates: true, overwrite: true });
    temporary.write(new Uint8Array(await response.arrayBuffer()));
    await temporary.move(target);
    return target.uri;
  } catch (error) {
    if (temporary.exists) temporary.delete();
    if (target.exists) return target.uri;
    throw error;
  }
}
