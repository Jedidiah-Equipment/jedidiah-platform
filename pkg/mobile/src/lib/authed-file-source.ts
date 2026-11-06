import { Directory, File, Paths } from 'expo-file-system';
import { useCallback, useEffect, useState } from 'react';
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

const LOADING: AuthedFileSource = { kind: 'loading' };
const fileId = ({ cacheDir, cacheName }: AuthedFileKey) => `${cacheDir}/${cacheName}`;

/**
 * A file behind the session cookie as a displayable URI: downloaded once into the OS cache, then served from there.
 * The web build overrides this with the API URL, since the browser sends the cookie and owns caching.
 */
export function useAuthedFileSource(key: AuthedFileKey): AuthedFileSource {
  return useAuthedFileSources([key]).sources[0] ?? LOADING;
}

/**
 * {@link useAuthedFileSource} for a set of files, each loading or failing on its own; `retry` loads the failed ones
 * again, since the set outlives any one look at a file.
 */
export function useAuthedFileSources(keys: readonly AuthedFileKey[]): {
  sources: AuthedFileSource[];
  retry: () => void;
} {
  const [sources, setSources] = useState<ReadonlyMap<string, AuthedFileSource>>(() => new Map());
  const [attempt, setAttempt] = useState(0);
  // The keys' contents, not the array's identity, decide what to load.
  const wanted = JSON.stringify({ attempt, keys });

  useEffect(() => {
    let active = true;
    for (const key of (JSON.parse(wanted) as { keys: AuthedFileKey[] }).keys) {
      resolveFileUri(key)
        .then(
          (uri): AuthedFileSource => ({ kind: 'ready', uri }),
          (error): AuthedFileSource => {
            captureSanitizedException(error, `${key.label} loading failed`, {
              source: 'authed_file',
              cacheDir: key.cacheDir,
            });
            return { kind: 'failed' };
          },
        )
        .then((source) => {
          if (active) setSources((current) => new Map(current).set(fileId(key), source));
        });
    }
    return () => {
      active = false;
    };
  }, [wanted]);

  const retry = useCallback(() => {
    setSources((current) => new Map([...current].filter(([, source]) => source.kind !== 'failed')));
    setAttempt((count) => count + 1);
  }, []);

  return { sources: keys.map((key) => sources.get(fileId(key)) ?? LOADING), retry };
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
