export const snapshotDirectory = new URL('../data/staging-snapshot/', import.meta.url);

// Downloaded doc-store objects live under an `objects/` subtree, addressed by their bucket-relative
// storage key (which contains slashes, so it maps onto nested directories). The whole snapshot
// directory is gitignored.
export const objectsDirectory = new URL('objects/', snapshotDirectory);

export function objectFilePath(storageKey: string): URL {
  return new URL(storageKey, objectsDirectory);
}
