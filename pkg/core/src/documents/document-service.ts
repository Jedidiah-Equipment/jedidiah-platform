import { type DatabaseTransaction, type Db, documents } from '@pkg/db';
import { sniffDocumentContentType, validateDocumentPolicy } from '@pkg/domain';
import type { AuthId, DocumentOwnerType, DocumentSummary, UUID } from '@pkg/schema';
import { DocumentSummary as DocumentSummarySchema } from '@pkg/schema';
import { eq } from 'drizzle-orm';

import { createAuditSnapshotChanges, documentAuditDescriptor, insertAuditEvent } from '../audit/audit-service.js';
import {
  DocumentNotFoundError,
  DocumentPolicyViolationError,
  DocumentStorageConflictError,
} from './document-errors.js';
import { type StorageAdapter, StorageKeyAlreadyExistsError, type StoredObject } from './storage-adapter.js';

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
  sourceProductId?: UUID | null;
  storageKey: string;
};

export type ReadDocumentResult = {
  document: DocumentSummary;
  object: StoredObject;
};

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
  db: Db;
  input: DocumentRecordCreateInput;
  mapInsertError?: (error: unknown) => Error;
  storage: StorageAdapter;
}): Promise<DocumentBaseRow> {
  const byteSize = input.bytes.byteLength;
  const verifiedContentType = sniffDocumentContentType(input.bytes);

  if (!verifiedContentType) {
    throw new DocumentPolicyViolationError({
      code: 'document.content_type_not_allowed',
      message:
        'Uploaded file content does not match an allowed document type. Only PDF, PNG, JPEG, or WebP documents can be uploaded.',
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
          sourceProductId: input.sourceProductId,
          storageKey: input.storageKey,
          uploaderUserId: actorUserId,
        })
        .returning();

      if (!row) {
        throw new Error('Document insert did not return a row');
      }

      await insertAuditEvent({
        db: tx,
        input: {
          action: 'created',
          actorUserId,
          after: toDocumentAuditRecord(row),
          before: null,
          changes: createAuditSnapshotChanges(toDocumentAuditRecord(row), documentAuditDescriptor.fields, 'created'),
          entityId: row.id,
          entityType: documentAuditDescriptor.entityType,
        },
      });

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
  db: Db;
  document: DocumentBaseRow;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(documents).where(eq(documents.id, document.id)).returning({ id: documents.id });

    if (!deleted) {
      throw new DocumentNotFoundError(document.id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'deleted',
        actorUserId,
        after: null,
        before: toDocumentAuditRecord(document),
        changes: createAuditSnapshotChanges(toDocumentAuditRecord(document), documentAuditDescriptor.fields, 'deleted'),
        entityId: document.id,
        entityType: documentAuditDescriptor.entityType,
      },
    });
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

function toDocumentAuditRecord(row: DocumentBaseRow) {
  return {
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    metadata: row.metadata,
    ownerType: row.ownerType,
    productId: row.productId,
    sourceProductId: row.sourceProductId,
    storageKey: row.storageKey,
    uploaderUserId: row.uploaderUserId,
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
