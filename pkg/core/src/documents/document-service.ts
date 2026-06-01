import { randomUUID } from 'node:crypto';

import { type DatabaseTransaction, type Db, documents, getUniqueViolationConstraint, products, user } from '@pkg/db';
import { hasPermission, sniffDocumentContentType, validateDocumentPolicy } from '@pkg/domain';
import type { AuthId, DocumentMetadata, UserAccessSummary, UUID } from '@pkg/schema';
import { DocumentMetadata as DocumentMetadataSchema } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { createAuditSnapshotChanges, documentAuditDescriptor, insertAuditEvent } from '../audit/audit-service.js';
import {
  DocumentForbiddenError,
  DocumentNotFoundError,
  DocumentOwnerNotFoundError,
  DocumentPolicyViolationError,
  DocumentStorageConflictError,
  DuplicateDocumentFilenameError,
} from './document-errors.js';
import { type StorageAdapter, StorageKeyAlreadyExistsError, type StoredObject } from './storage-adapter.js';

const PRODUCT_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_product_id_filename_ci_unique';

type DocumentRow = typeof documents.$inferSelect;
type DocumentDb = Db | DatabaseTransaction;
type DocumentWithUploaderRow = DocumentRow & {
  uploaderEmail: string | null;
  uploaderName: string | null;
};

export type UploadProductDocumentInput = {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  productId: UUID;
};

export type ReadDocumentResult = {
  document: DocumentMetadata;
  object: StoredObject;
};

export async function uploadProductDocument({
  access,
  actorUserId,
  db,
  input,
  storage,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  input: UploadProductDocumentInput;
  storage: StorageAdapter;
}): Promise<DocumentMetadata> {
  assertCanUploadProductDocument(access);
  await assertProductExists({ db, productId: input.productId });

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
    ownerType: 'product',
  });

  if (!policyResult.ok) {
    throw new DocumentPolicyViolationError(policyResult);
  }

  const storageKey = createProductDocumentStorageKey({
    filename: input.filename,
    productId: input.productId,
  });

  try {
    await storage.put({
      body: input.bytes,
      byteSize,
      contentType: verifiedContentType,
      key: storageKey,
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
          ownerType: 'product',
          productId: input.productId,
          storageKey,
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

      return getDocumentMetadata({ db: tx, id: row.id });
    });
  } catch (error) {
    const mappedError = mapDocumentUniqueViolation(error, {
      filename: input.filename,
      productId: input.productId,
    });

    try {
      await storage.deleteObject(storageKey);
    } catch (cleanupError) {
      throw new AggregateError([mappedError, cleanupError], 'Failed to save document and clean up uploaded object');
    }

    throw mappedError;
  }
}

export async function listProductDocuments({
  access,
  db,
  productId,
}: {
  access: UserAccessSummary;
  db: Db;
  productId: UUID;
}): Promise<DocumentMetadata[]> {
  assertCanReadProductDocument(access);
  await assertProductExists({ db, productId });

  const rows = await selectDocumentMetadata(db)
    .where(eq(documents.productId, productId))
    .orderBy(asc(documents.filename));

  return rows.map(mapDocumentMetadata);
}

export async function readDocument({
  db,
  id,
  storage,
}: {
  db: Db;
  id: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });

  if (!row) {
    throw new DocumentNotFoundError(id);
  }

  const document = await getDocumentMetadata({ db, id });
  const object = await storage.get(row.storageKey);

  return {
    document,
    object,
  };
}

export async function deleteDocument({
  access,
  actorUserId,
  db,
  id,
}: {
  access: UserAccessSummary;
  actorUserId: AuthId;
  db: Db;
  id: UUID;
}): Promise<void> {
  assertCanDeleteProductDocument(access);

  await db.transaction(async (tx) => {
    const row = await tx.query.documents.findFirst({
      where: eq(documents.id, id),
    });

    if (!row) {
      throw new DocumentNotFoundError(id);
    }

    const [deleted] = await tx.delete(documents).where(eq(documents.id, id)).returning({ id: documents.id });

    if (!deleted) {
      throw new DocumentNotFoundError(id);
    }

    await insertAuditEvent({
      db: tx,
      input: {
        action: 'deleted',
        actorUserId,
        after: null,
        before: toDocumentAuditRecord(row),
        changes: createAuditSnapshotChanges(toDocumentAuditRecord(row), documentAuditDescriptor.fields, 'deleted'),
        entityId: row.id,
        entityType: documentAuditDescriptor.entityType,
      },
    });
  });
}

function assertCanUploadProductDocument(access: UserAccessSummary): void {
  if (!hasPermission(access, 'product:update')) {
    throw new DocumentForbiddenError('You do not have permission to upload Product documents.');
  }
}

function assertCanReadProductDocument(access: UserAccessSummary): void {
  if (!hasPermission(access, 'product:read')) {
    throw new DocumentForbiddenError('You do not have permission to read Product documents.');
  }
}

function assertCanDeleteProductDocument(access: UserAccessSummary): void {
  if (!hasPermission(access, 'product:update')) {
    throw new DocumentForbiddenError('You do not have permission to delete Product documents.');
  }
}

async function assertProductExists({ db, productId }: { db: Db; productId: UUID }): Promise<void> {
  const [product] = await db
    .select({
      id: products.id,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    throw new DocumentOwnerNotFoundError({ ownerId: productId, ownerType: 'product' });
  }
}

async function getDocumentMetadata({ db, id }: { db: DocumentDb; id: UUID }): Promise<DocumentMetadata> {
  const [row] = await selectDocumentMetadata(db).where(eq(documents.id, id)).limit(1);

  if (!row) {
    throw new DocumentNotFoundError(id);
  }

  return mapDocumentMetadata(row);
}

function selectDocumentMetadata(db: DocumentDb) {
  return db
    .select({
      byteSize: documents.byteSize,
      contentType: documents.contentType,
      createdAt: documents.createdAt,
      filename: documents.filename,
      id: documents.id,
      jobId: documents.jobId,
      ownerType: documents.ownerType,
      productId: documents.productId,
      sourceProductId: documents.sourceProductId,
      storageKey: documents.storageKey,
      uploaderEmail: user.email,
      uploaderName: user.name,
      uploaderUserId: documents.uploaderUserId,
    })
    .from(documents)
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .$dynamic();
}

function mapDocumentMetadata(row: DocumentWithUploaderRow): DocumentMetadata {
  return DocumentMetadataSchema.parse({
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    ownerType: row.ownerType,
    productId: row.productId,
    sourceProductId: row.sourceProductId,
    uploaderEmail: row.uploaderEmail,
    uploaderName: row.uploaderName,
    uploaderUserId: row.uploaderUserId,
  });
}

function createProductDocumentStorageKey(input: { filename: string; productId: UUID }): string {
  return `documents/product/${input.productId}/${randomUUID()}-${sanitizeStorageKeySuffix(input.filename)}`;
}

function sanitizeStorageKeySuffix(filename: string): string {
  const sanitized = filename
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return sanitized || 'document.pdf';
}

function toDocumentAuditRecord(row: DocumentRow) {
  return {
    byteSize: row.byteSize,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    filename: row.filename,
    id: row.id,
    jobId: row.jobId,
    ownerType: row.ownerType,
    productId: row.productId,
    sourceProductId: row.sourceProductId,
    storageKey: row.storageKey,
    uploaderUserId: row.uploaderUserId,
  };
}

function mapDocumentUniqueViolation(error: unknown, input: { filename: string; productId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes(PRODUCT_DOCUMENT_FILENAME_UNIQUE_INDEX) || isProductDocumentFilenameUniqueDetail(error)) {
    return new DuplicateDocumentFilenameError(input);
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isProductDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectErrorText(error).join('\n');

  return text.includes('documents') && text.includes('product_id') && text.includes('lower(filename)');
}

function collectErrorText(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) {
    return [];
  }

  const ownText = ['message', 'detail'].flatMap((property) => {
    const value = property in error ? error[property as keyof typeof error] : null;

    return typeof value === 'string' ? [value] : [];
  });
  const causeText = 'cause' in error ? collectErrorText(error.cause) : [];

  return [...ownText, ...causeText];
}
