import { type DatabaseTransaction, type Db, getUniqueViolationConstraint, user } from '@pkg/db';
import type { AuthId, UUID } from '@pkg/schema';
import type { PurchaseOrderDocumentMetadata, PurchaseOrderDocumentRow } from '@pkg/schema/equipment';
import { PurchaseOrderDocumentRow as PurchaseOrderDocumentRowSchema } from '@pkg/schema/equipment';
import { eq } from 'drizzle-orm';
import type { StorageAdapter } from '../../storage/storage-adapter.js';
import { DuplicateDocumentFilenameError } from '../documents/document-errors.js';
import { collectDocumentErrorText, createDocumentRecord, type DocumentBaseRow } from '../documents/document-service.js';
import { purchaseOrderDocumentStorageKey } from './purchase-order-service.js';

/**
 * Filing one document into an order's collection.
 *
 * Everything a credit note and a supplier invoice do identically lives here: the storage key, the
 * transaction, the filename-conflict mapping, the orphaned-object cleanup, and the row the desk
 * gets back. What differs between them is only the reference each writes beside its document, which
 * is what the two hooks are for — both run inside the same transaction as the document insert, so a
 * document can never sit in the collection without the reference that gives it meaning.
 */
export async function filePurchaseOrderDocument({
  actorUserId,
  assertWritable,
  bytes,
  db,
  filename,
  metadata,
  purchaseOrderId,
  settledReturnIds = [],
  storage,
  writeReferences,
}: {
  actorUserId: AuthId;
  /** Checked before any bytes reach storage, so the common refusal costs nothing to undo. */
  assertWritable?: (tx: DatabaseTransaction) => Promise<void>;
  bytes: Uint8Array;
  db: Db;
  filename: string;
  metadata: PurchaseOrderDocumentMetadata;
  purchaseOrderId: UUID;
  settledReturnIds?: readonly UUID[];
  storage: StorageAdapter;
  /** The reference this kind of document writes beside itself, once its row exists. */
  writeReferences?: (tx: DatabaseTransaction, document: DocumentBaseRow) => Promise<void>;
}): Promise<PurchaseOrderDocumentRow> {
  const storageKey = purchaseOrderDocumentStorageKey(purchaseOrderId, filename);

  try {
    return await db.transaction(async (tx) => {
      await assertWritable?.(tx);

      const document = await createDocumentRecord({
        actorUserId,
        db: tx,
        input: { bytes, filename, metadata, ownerType: 'purchase_order', purchaseOrderId, storageKey },
        mapInsertError: (error) => mapPurchaseOrderDocumentUniqueViolation(error, { filename, purchaseOrderId }),
        storage,
      });

      await writeReferences?.(tx, document);

      const [actor] = await tx.select({ name: user.name }).from(user).where(eq(user.id, actorUserId));

      return PurchaseOrderDocumentRowSchema.parse({
        byteSize: document.byteSize,
        contentType: document.contentType,
        createdAt: document.createdAt.toISOString(),
        filename: document.filename,
        id: document.id,
        revision: null,
        settledReturnIds: [...settledReturnIds],
        type: metadata.type,
        uploaderName: actor?.name ?? null,
      });
    });
  } catch (error) {
    // createDocumentRecord stores the object before its own insert, so a reference write failing
    // after it would otherwise leave an object nobody can reach.
    try {
      await storage.deleteObject(storageKey);
    } catch {
      // The upload may never have got as far as storing anything; the original failure is the news.
    }

    throw error;
  }
}

const PURCHASE_ORDER_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_purchase_order_id_filename_ci_unique';

/** The order's own filename-uniqueness index, reported as the conflict it is (see the Quote path). */
function mapPurchaseOrderDocumentUniqueViolation(
  error: unknown,
  input: { filename: string; purchaseOrderId: UUID },
): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (
    constraint?.includes(PURCHASE_ORDER_DOCUMENT_FILENAME_UNIQUE_INDEX) ||
    isPurchaseOrderDocumentFilenameUniqueDetail(error)
  ) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.purchaseOrderId,
      ownerType: 'purchase_order',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isPurchaseOrderDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectDocumentErrorText(error).join('\n');

  return text.includes('documents') && text.includes('purchase_order_id') && text.includes('lower(filename)');
}
