import { randomUUID } from 'node:crypto';

import { type DatabaseTransaction, type Db, documents, getUniqueViolationConstraint, products, user } from '@pkg/db';
import { hasPermission, validateDocumentPolicy } from '@pkg/domain';
import type { AuthId, DocumentMetadata, UserAccessSummary, UUID } from '@pkg/schema';
import { DocumentMetadata as DocumentMetadataSchema } from '@pkg/schema';
import { asc, eq } from 'drizzle-orm';

import { documentAuditDescriptor, insertAuditEvent } from '../audit/audit-service.js';
import {
  DocumentForbiddenError,
  DocumentNotFoundError,
  DocumentOwnerNotFoundError,
  DocumentPolicyViolationError,
  DocumentStorageConflictError,
  DuplicateDocumentFilenameError,
} from './document-errors.js';
import { type StorageAdapter, StorageKeyAlreadyExistsError, type StoredObject } from './storage-adapter.js';

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
  const policyResult = validateDocumentPolicy({
    byteSize,
    contentType: input.contentType,
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
      contentType: input.contentType,
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
          contentType: input.contentType,
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
          changes: {
            storageKey: {
              from: null,
              to: storageKey,
            },
          },
          entityId: row.id,
          entityType: documentAuditDescriptor.entityType,
        },
      });

      return getDocumentMetadata({ db: tx, id: row.id });
    });
  } catch (error) {
    throw mapDocumentUniqueViolation(error, {
      filename: input.filename,
      productId: input.productId,
    });
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
  access,
  db,
  id,
  storage,
}: {
  access: UserAccessSummary;
  db: Db;
  id: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  assertCanReadProductDocument(access);

  const document = await getDocumentMetadata({ db, id });
  const row = await db.query.documents.findFirst({
    where: eq(documents.id, id),
  });

  if (!row) {
    throw new DocumentNotFoundError(id);
  }

  const object = await storage.get(row.storageKey);

  return {
    document,
    object,
  };
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
      ownerType: documents.ownerType,
      productId: documents.productId,
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
    ownerType: row.ownerType,
    productId: row.productId,
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
    filename: row.filename,
    productId: row.productId,
    storageKey: row.storageKey,
  };
}

function mapDocumentUniqueViolation(error: unknown, input: { filename: string; productId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes('documents_product_id_filename_ci_unique')) {
    return new DuplicateDocumentFilenameError(input);
  }

  if (constraint !== null) {
    return new DuplicateDocumentFilenameError(input);
  }

  return error instanceof Error ? error : new Error(String(error));
}
