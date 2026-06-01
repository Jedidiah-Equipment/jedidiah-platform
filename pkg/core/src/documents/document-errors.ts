import type { DocumentPolicyViolationCode } from '@pkg/domain';

export class DuplicateDocumentFilenameError extends Error {
  readonly code = 'document.duplicate_filename';
  readonly metadata: { filename: string; productId: string };

  constructor(input: { filename: string; productId: string }) {
    super(`Document filename already exists for product: ${input.filename}`);
    this.name = 'DuplicateDocumentFilenameError';
    this.metadata = input;
  }
}

export class DocumentForbiddenError extends Error {
  readonly code = 'document.forbidden';

  constructor(message = 'You do not have permission to access this document.') {
    super(message);
    this.name = 'DocumentForbiddenError';
  }
}

export class DocumentNotFoundError extends Error {
  readonly code = 'document.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`Document not found: ${id}`);
    this.name = 'DocumentNotFoundError';
    this.metadata = { id };
  }
}

export class DocumentOwnerNotFoundError extends Error {
  readonly code = 'document.owner_not_found';
  readonly metadata: { ownerId: string; ownerType: 'product' };

  constructor(input: { ownerId: string; ownerType: 'product' }) {
    super(`Document owner not found: ${input.ownerType}:${input.ownerId}`);
    this.name = 'DocumentOwnerNotFoundError';
    this.metadata = input;
  }
}

export class DocumentPolicyViolationError extends Error {
  readonly code: DocumentPolicyViolationCode;

  constructor(input: { code: DocumentPolicyViolationCode; message: string }) {
    super(input.message);
    this.name = 'DocumentPolicyViolationError';
    this.code = input.code;
  }
}

export class DocumentStorageConflictError extends Error {
  readonly code = 'document.storage_key_conflict';

  constructor() {
    super('Generated document storage key already exists.');
    this.name = 'DocumentStorageConflictError';
  }
}

export type DocumentCoreError =
  | DocumentForbiddenError
  | DocumentNotFoundError
  | DocumentOwnerNotFoundError
  | DocumentPolicyViolationError
  | DocumentStorageConflictError
  | DuplicateDocumentFilenameError;

export function isDocumentCoreError(error: unknown): error is DocumentCoreError {
  return (
    error instanceof DocumentForbiddenError ||
    error instanceof DocumentNotFoundError ||
    error instanceof DocumentOwnerNotFoundError ||
    error instanceof DocumentPolicyViolationError ||
    error instanceof DocumentStorageConflictError ||
    error instanceof DuplicateDocumentFilenameError
  );
}
