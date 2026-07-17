import { randomUUID } from 'node:crypto';
import { type Db, documents, getUniqueViolationConstraint } from '@pkg/db';
import type { AuthId, JobDocument, UUID } from '@pkg/schema';
import { and, eq } from 'drizzle-orm';
import {
  DocumentDeleteNotAllowedError,
  DocumentNotFoundError,
  DuplicateDocumentFilenameError,
} from '../documents/document-errors.js';
import {
  collectDocumentErrorText,
  createDocumentRecord,
  deleteDocumentRecord,
  documentBaseSelect,
  sanitizeDocumentStorageKeySuffix,
} from '../documents/document-service.js';
import type { StorageAdapter } from '../documents/storage-adapter.js';
import { lockMutableJob } from './job-mutation-guards.js';
import { getJobDocuments } from './job-read-service.js';

const JOB_DOCUMENT_FILENAME_UNIQUE_INDEX = 'documents_job_id_filename_ci_unique';

export async function createJobPurchaseOrder({
  actorUserId,
  bytes,
  db,
  filename,
  jobId,
  storage,
}: {
  actorUserId: AuthId;
  bytes: Uint8Array;
  db: Db;
  filename: string;
  jobId: UUID;
  storage: StorageAdapter;
}): Promise<JobDocument> {
  return db.transaction(async (tx) => {
    await lockMutableJob(tx, jobId);
    const row = await createDocumentRecord({
      actorUserId,
      db: tx,
      input: {
        bytes,
        filename,
        jobId,
        metadata: { type: 'purchase_order' },
        ownerType: 'job',
        storageKey: `documents/job/${jobId}/${randomUUID()}-${sanitizeDocumentStorageKeySuffix(filename)}`,
      },
      mapInsertError: (error) => mapJobDocumentUniqueViolation(error, { filename, jobId }),
      storage,
    });
    const document = (await getJobDocuments({ db: tx, jobId })).find((item) => item.id === row.id);

    if (!document) {
      throw new DocumentNotFoundError(row.id);
    }

    return document;
  });
}

export async function deleteJobPurchaseOrder({
  actorUserId,
  db,
  documentId,
  jobId,
}: {
  actorUserId: AuthId;
  db: Db;
  documentId: UUID;
  jobId: UUID;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await lockMutableJob(tx, jobId);
    const [document] = await tx
      .select(documentBaseSelect)
      .from(documents)
      .where(and(eq(documents.jobId, jobId), eq(documents.id, documentId)))
      .limit(1);

    if (!document) {
      throw new DocumentNotFoundError(documentId);
    }

    if (!('type' in document.metadata) || document.metadata.type !== 'purchase_order') {
      throw new DocumentDeleteNotAllowedError(documentId);
    }

    await deleteDocumentRecord({ actorUserId, db: tx, document });
  });
}

function mapJobDocumentUniqueViolation(error: unknown, input: { filename: string; jobId: UUID }): Error {
  const constraint = getUniqueViolationConstraint(error);

  if (constraint?.includes(JOB_DOCUMENT_FILENAME_UNIQUE_INDEX) || isJobDocumentFilenameUniqueDetail(error)) {
    return new DuplicateDocumentFilenameError({
      filename: input.filename,
      ownerId: input.jobId,
      ownerType: 'job',
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

function isJobDocumentFilenameUniqueDetail(error: unknown): boolean {
  const text = collectDocumentErrorText(error).join('\n');

  return text.includes('documents') && text.includes('job_id') && text.includes('lower(filename)');
}
