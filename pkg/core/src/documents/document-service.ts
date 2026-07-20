import { type DatabaseTransaction, type Db, documents } from '@pkg/db';
import { getDocumentPolicy, sniffDocumentContentType, validateDocumentPolicy } from '@pkg/domain';
import type { AuthId, DocumentOwnerType, DocumentSummary, UUID } from '@pkg/schema';
import { DocumentSummary as DocumentSummarySchema } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { defineAuditDescriptor, recordAuditCreate, recordAuditDelete } from '../audit/audit-service.js';
import {
  DocumentNotFoundError,
  DocumentPolicyViolationError,
  DocumentStorageConflictError,
} from './document-errors.js';
import {
  readStoredObject,
  type StorageAdapter,
  StorageKeyAlreadyExistsError,
  type StoredObject,
} from './storage-adapter.js';

type DocumentRow = typeof documents.$inferSelect;
export type DocumentDb = Db | DatabaseTransaction;
export type DocumentBaseRow = Pick<
  DocumentRow,
  | 'byteSize'
  | 'contentType'
  | 'createdAt'
  | 'filename'
  | 'id'
  | 'jobId'
  | 'metadata'
  | 'ownerType'
  | 'productId'
  | 'quoteId'
  | 'sourceProductId'
  | 'storageKey'
  | 'uploaderUserId'
>;
export type DocumentSummaryRow = DocumentBaseRow & {
  uploaderEmail: string | null;
  uploaderName: string | null;
};

export type DocumentRecordCreateInput = {
  bytes: Uint8Array;
  filename: string;
  jobId?: UUID | null;
  metadata: DocumentRow['metadata'];
  ownerType: DocumentOwnerType;
  productId?: UUID | null;
  quoteId?: UUID | null;
  sourceProductId?: UUID | null;
  storageKey: string;
};

export type ReadDocumentResult = {
  document: DocumentSummary;
  object: StoredObject;
};

export async function readStoredObjectBytes(storage: StorageAdapter, storageKey: string): Promise<Uint8Array> {
  return (await readStoredObject(storage, storageKey)).bytes;
}

export const documentBaseSelect = {
  byteSize: documents.byteSize,
  contentType: documents.contentType,
  createdAt: documents.createdAt,
  filename: documents.filename,
  id: documents.id,
  jobId: documents.jobId,
  metadata: documents.metadata,
  ownerType: documents.ownerType,
  productId: documents.productId,
  quoteId: documents.quoteId,
  sourceProductId: documents.sourceProductId,
  storageKey: documents.storageKey,
  uploaderUserId: documents.uploaderUserId,
};

export async function createDocumentRecord({
  actorUserId,
  db,
  input,
  mapInsertError,
  storage,
}: {
  actorUserId: AuthId;
  // Accepts an active transaction so callers mid-transaction (e.g. the Job document snapshot) create
  // documents through this canonical path; the insert + audit then run as a savepoint on that tx.
  db: DocumentDb;
  input: DocumentRecordCreateInput;
  mapInsertError?: (error: unknown) => Error;
  storage: StorageAdapter;
}): Promise<DocumentBaseRow> {
  const byteSize = input.bytes.byteLength;
  const verifiedContentType = sniffDocumentContentType(input.bytes);

  if (!verifiedContentType) {
    const policy = getDocumentPolicy(input.ownerType);
    throw new DocumentPolicyViolationError({
      code: 'document.content_type_not_allowed',
      message: `Uploaded file content does not match an allowed document type: ${policy.allowedContentTypes.join(', ')}.`,
    });
  }

  const policyResult = validateDocumentPolicy({
    byteSize,
    contentType: verifiedContentType,
    ownerType: input.ownerType,
  });

  if (!policyResult.ok) {
    throw new DocumentPolicyViolationError(policyResult);
  }

  try {
    await storage.put({
      body: input.bytes,
      byteSize,
      contentType: verifiedContentType,
      key: input.storageKey,
    });
  } catch (error) {
    if (error instanceof StorageKeyAlreadyExistsError) {
      throw new DocumentStorageConflictError();
    }

    throw error;
  }

  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(documents)
        .values({
          byteSize,
          contentType: verifiedContentType,
          filename: input.filename,
          jobId: input.jobId,
          metadata: input.metadata,
          ownerType: input.ownerType,
          productId: input.productId,
          quoteId: input.quoteId,
          sourceProductId: input.sourceProductId,
          storageKey: input.storageKey,
          uploaderUserId: actorUserId,
        })
        .returning();

      if (!row) {
        throw new Error('Document insert did not return a row');
      }

      await recordAuditCreate({ db: tx, descriptor: documentAuditDescriptor, actorUserId, input: row });

      return row;
    });
  } catch (error) {
    const mappedError = mapInsertError ? mapInsertError(error) : toError(error);

    try {
      await storage.deleteObject(input.storageKey);
    } catch (cleanupError) {
      throw new AggregateError([mappedError, cleanupError], 'Failed to save document and clean up uploaded object');
    }

    throw mappedError;
  }
}

export async function deleteDocumentRecord({
  actorUserId,
  db,
  document,
}: {
  actorUserId: AuthId;
  db: DocumentDb;
  document: DocumentBaseRow;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(documents).where(eq(documents.id, document.id)).returning({ id: documents.id });

    if (!deleted) {
      throw new DocumentNotFoundError(document.id);
    }

    await recordAuditDelete({ db: tx, descriptor: documentAuditDescriptor, actorUserId, input: document });
  });
}

export function selectDocumentBase(db: DocumentDb) {
  return db.select(documentBaseSelect).from(documents).$dynamic();
}

export function mapDocumentSummary(row: DocumentSummaryRow): DocumentSummary {
  return DocumentSummarySchema.parse({
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    quoteId: row.quoteId,
    sourceProductId: row.sourceProductId,
    uploaderEmail: row.uploaderEmail,
    uploaderName: row.uploaderName,
    uploaderUserId: row.uploaderUserId,
  });
}

export function sanitizeDocumentStorageKeySuffix(filename: string): string {
  const sanitized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'document.pdf';
}

export function collectDocumentErrorText(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const ownText = ['message', 'detail'].flatMap((property) => {
    const value = property in error ? error[property as keyof typeof error] : null;

    return typeof value === 'string' ? [value] : [];
  });
  const causeText = 'cause' in error ? collectDocumentErrorText(error.cause) : [];

  return [...ownText, ...causeText];
}

export const documentAuditDescriptor = defineAuditDescriptor<DocumentBaseRow>({
  entityType: 'document',
  noun: 'document',
  primaryLabelField: 'filename',
  entityId: (row) => row.id,
  toRecord: (row) => ({
    byteSize: row.byteSize,
    contentType: row.contentType,
    filename: row.filename,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    quoteId: row.quoteId,
    sourceProductId: row.sourceProductId,
    storageKey: row.storageKey,
  }),
});

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
