import { randomUUID } from 'node:crypto';

import { type Db, documents, getUniqueViolationConstraint, quotes, user } from '@pkg/db';
import { validateDocumentMetadata } from '@pkg/domain';
import {
  type AuthId,
  type QuoteDocument,
  type QuoteDocumentCreateInput,
  QuoteDocumentMetadata,
  type QuoteDocumentModel,
  type QuoteDocumentPdfRenderer,
  type QuoteDocumentPricingRow,
  QuoteDocument as QuoteDocumentSchema,
  type UUID,
} from '@pkg/schema';
import { and, eq, sql } from 'drizzle-orm';

import {
  DocumentNotFoundError,
  DocumentPolicyViolationError,
  DuplicateDocumentFilenameError,
} from '../documents/document-errors.js';
import {
  collectDocumentErrorText,
  createDocumentRecord,
  type DocumentSummaryRow,
  documentBaseSelect,
  mapDocumentSummary,
  type ReadDocumentResult,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { QuoteNotFoundError } from './quote-errors.js';

const QUOTE_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_quote_id_filename_ci_unique';

export type { QuoteDocumentCreateInput, QuoteDocumentModel, QuoteDocumentPdfRenderer, QuoteDocumentPricingRow };

export async function getQuoteDocuments({ db, quoteId }: { db: Db; quoteId: UUID }): Promise<QuoteDocument[]> {
  await assertQuoteExists({ db, quoteId });

  const rows = await selectQuoteDocumentSummary(db)
    .where(eq(documents.quoteId, quoteId))
    .orderBy(sql`${documents.createdAt} desc`, sql`${documents.id} desc`);

  return rows.map(mapQuoteDocumentSummary);
}

export async function createQuoteDocument({
  actorUserId,
  db,
  input,
  storage,
}: {
  actorUserId: AuthId;
  db: Db;
  input: QuoteDocumentCreateInput;
  storage: StorageAdapter;
}): Promise<QuoteDocument> {
  await assertQuoteExists({ db, quoteId: input.quoteId });
  const metadata = parseQuoteDocumentMetadata(input.metadata);
  const row = await createDocumentRecord({
    actorUserId,
    db,
    input: {
      bytes: input.bytes,
      filename: input.filename,
      metadata,
      ownerType: 'quote',
      quoteId: input.quoteId,
      storageKey: createQuoteDocumentStorageKey({
        filename: input.filename,
        quoteId: input.quoteId,
      }),
    },
    mapInsertError: (error) =>
      mapQuoteDocumentUniqueViolation(error, {
        filename: input.filename,
        quoteId: input.quoteId,
      }),
    storage,
  });

  return getQuoteDocumentSummary({ db, documentId: row.id, quoteId: input.quoteId });
}

export async function readQuoteDocument({
  db,
  documentId,
  quoteId,
  storage,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
  storage: StorageAdapter;
}): Promise<ReadDocumentResult> {
  await assertQuoteExists({ db, quoteId });
  const document = await getQuoteDocumentSummaryRow({ db, documentId, quoteId });

  return {
    document: mapDocumentSummary(document),
    object: await storage.get(document.storageKey),
  };
}

function parseQuoteDocumentMetadata(metadata: unknown): QuoteDocumentMetadata {
  const result = validateDocumentMetadata({ metadata, ownerType: 'quote' });

  if (!result.ok) {
    throw new DocumentPolicyViolationError(result);
  }

  return QuoteDocumentMetadata.parse(metadata);
}

function selectQuoteDocumentSummary(db: Db) {
  return db
    .select({
      ...documentBaseSelect,
      uploaderEmail: user.email,
      uploaderName: user.name,
    })
    .from(documents)
    .leftJoin(user, eq(documents.uploaderUserId, user.id))
    .$dynamic();
}

async function getQuoteDocumentSummary({
  db,
  documentId,
  quoteId,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
}): Promise<QuoteDocument> {
  return mapQuoteDocumentSummary(await getQuoteDocumentSummaryRow({ db, documentId, quoteId }));
}

function mapQuoteDocumentSummary(row: DocumentSummaryRow): QuoteDocument {
  return QuoteDocumentSchema.parse(mapDocumentSummary(row));
}

async function getQuoteDocumentSummaryRow({
  db,
  documentId,
  quoteId,
}: {
  db: Db;
  documentId: UUID;
  quoteId: UUID;
}): Promise<DocumentSummaryRow> {
  const [row] = await selectQuoteDocumentSummary(db)
    .where(and(eq(documents.quoteId, quoteId), eq(documents.id, documentId)))
    .limit(1);

  if (!row) {
    throw new DocumentNotFoundError(documentId);
  }

  return row;
}

async function assertQuoteExists({ db, quoteId }: { db: Db; quoteId: UUID }): Promise<void> {
  const [quote] = await db
    .select({
      id: quotes.id,
    })
    .from(quotes)
    .where(eq(quotes.id, quoteId))
    .limit(1);

  if (!quote) {
    throw new QuoteNotFoundError(quoteId);
  }
}

function createQuoteDocumentStorageKey(input: { filename: string; quoteId: UUID }): string {
  return `documents/quote/${input.quoteId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(input.filename)}`;
}

function mapQuoteDocumentUniqueViolation(error: unknown, input: { filename: string; quoteId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes(QUOTE_DOCUMENT_FILENAME_UNIQUE_INDEX) || isQuoteDocumentFilenameUniqueDetail(error)) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.quoteId,
      ownerType: 'quote',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isQuoteDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectDocumentErrorText(error).join('\n');

  return text.includes('documents') && text.includes('quote_id') && text.includes('lower(filename)');
}
