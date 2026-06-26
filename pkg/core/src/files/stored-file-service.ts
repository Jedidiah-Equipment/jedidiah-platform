import type { DatabaseTransaction, Db, StoredFile } from '@pkg/db';
import { type FilePolicy, validateFile } from '@pkg/domain';

import type { StorageAdapter } from '../documents/storage-adapter.js';
import { FilePolicyViolationError } from './file-errors.js';

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

// The storage-key file extension for an accepted content type, for bindings building their key.
// Falls back to `bin` for anything the policy somehow let through unmapped.
export function fileExtensionFor(contentType: string): string {
  return CONTENT_TYPE_EXTENSIONS[contentType] ?? 'bin';
}

// Persists a new file reference for one owner/target inside the replace transaction and reports the
// object it superseded. The binding owns everything entity-specific: locking and checking the owner
// exists (throwing the owner's not-found error), where the reference lives (a column or a jsonb slot),
// and recording the audit entry.
export type FileReplacementBinding = {
  apply: (args: { nextRef: StoredFile; tx: DatabaseTransaction }) => Promise<{ previousStorageKey: string | null }>;
  buildStorageKey: (args: { contentType: string }) => string;
};

// The generic replace-in-place pipeline: validate the bytes against the policy, store the new object,
// let the binding swap the reference and audit it in one transaction, then delete the superseded object.
// A failed swap rolls back and removes the just-uploaded object, so a current file is never stranded.
export async function replaceFile({
  binding,
  bytes,
  db,
  policy,
  storage,
}: {
  binding: FileReplacementBinding;
  bytes: Uint8Array;
  db: Db;
  policy: FilePolicy;
  storage: StorageAdapter;
}): Promise<StoredFile> {
  const validation = validateFile(bytes, policy);

  if (!validation.ok) {
    throw new FilePolicyViolationError(validation);
  }

  const storageKey = binding.buildStorageKey({ contentType: validation.contentType });
  const nextRef: StoredFile = {
    byteSize: validation.byteSize,
    contentType: validation.contentType,
    storageKey,
    updatedAt: new Date().toISOString(),
  };

  // Storage keys carry a fresh UUID, so a collision (StorageKeyAlreadyExistsError) means a genuine
  // adapter problem; let it surface rather than silently overwriting.
  await storage.put({
    body: bytes,
    byteSize: validation.byteSize,
    contentType: validation.contentType,
    key: storageKey,
  });

  let previousStorageKey: string | null;

  try {
    ({ previousStorageKey } = await db.transaction((tx) => binding.apply({ nextRef, tx })));
  } catch (error) {
    await cleanUpOrphanedObject(storage, storageKey, error);
    throw error;
  }

  // The swap is committed; clearing the superseded object is best-effort so a storage hiccup does not
  // fail a replace that already succeeded.
  if (previousStorageKey && previousStorageKey !== storageKey) {
    try {
      await storage.deleteObject(previousStorageKey);
    } catch {
      // Leave the orphaned object; the reference already points at the new object.
    }
  }

  return nextRef;
}

async function cleanUpOrphanedObject(storage: StorageAdapter, storageKey: string, cause: unknown): Promise<void> {
  try {
    await storage.deleteObject(storageKey);
  } catch (cleanupError) {
    throw new AggregateError([cause, cleanupError], 'Failed to replace file and clean up the uploaded object');
  }
}
