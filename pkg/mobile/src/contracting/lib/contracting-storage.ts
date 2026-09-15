const CONTRACTING_STORAGE_PREFIX = 'contracting';

/** AsyncStorage key under the Contracting namespace; segments join with ':'. */
export function contractingStorageKey(...segments: string[]): string {
  return [CONTRACTING_STORAGE_PREFIX, ...segments].join(':');
}
