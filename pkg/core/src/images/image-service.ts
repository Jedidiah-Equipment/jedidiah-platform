import type { DatabaseTransaction, Db, StoredImageRef } from '@pkg/db';
import { type ImagePolicy, validateImage } from '@pkg/domain';

import type { StorageAdapter, StoredObject } from '../documents/storage-adapter.js';
import { type ImageNotFoundError, ImagePolicyViolationError } from './image-errors.js';

// Persists a new image reference for one owner/target inside the replace transaction and reports the
// object it superseded. The binding owns everything entity-specific: locking and checking the owner
// exists (throwing the owner's not-found error), where the reference lives (a column or a jsonb slot),
// and recording the audit entry.
export type ImageReplacementBinding = {
  apply: (args: { nextRef: StoredImageRef; tx: DatabaseTransaction }) => Promise<{ previousStorageKey: string | null }>;
  buildStorageKey: (args: { contentType: string }) => string;
};

// The generic replace-in-place pipeline: validate the bytes against the policy, store the new object,
// let the binding swap the reference and audit it in one transaction, then delete the superseded object.
// A failed swap rolls back and removes the just-uploaded object, so a current image is never stranded.
export async function replaceImage({
  binding,
  bytes,
  db,
  policy,
  storage,
}: {
  binding: ImageReplacementBinding;
  bytes: Uint8Array;
  db: Db;
  policy: ImagePolicy;
  storage: StorageAdapter;
}): Promise<StoredImageRef> {
  const validation = validateImage(bytes, policy);

  if (!validation.ok) {
    throw new ImagePolicyViolationError(validation);
  }

  const storageKey = binding.buildStorageKey({ contentType: validation.contentType });
  const nextRef: StoredImageRef = {
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

// Streams a stored image, raising {@link ImageNotFoundError} when the target has no current image.
export async function readImage({
  notFound,
  ref,
  storage,
}: {
  notFound: () => ImageNotFoundError;
  ref: StoredImageRef | null;
  storage: StorageAdapter;
}): Promise<StoredObject> {
  if (!ref) {
    throw notFound();
  }

  return storage.get(ref.storageKey);
}

async function cleanUpOrphanedObject(storage: StorageAdapter, storageKey: string, cause: unknown): Promise<void> {
  try {
    await storage.deleteObject(storageKey);
  } catch (cleanupError) {
    throw new AggregateError([cause, cleanupError], 'Failed to replace image and clean up the uploaded object');
  }
}
