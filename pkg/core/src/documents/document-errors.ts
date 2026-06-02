import type { DocumentPolicyViolationCode } from '@pkg/domain';

export class DuplicateDocumentFilenameError extends Error {
  readonly code = 'document.duplicate_filename';
  readonly metadata: { filename: string; ownerId: string; ownerType: 'product' | 'quote' };

  constructor(input: { filename: string; ownerId: string; ownerType: 'product' | 'quote' }) {
    super(`Document filename already exists for ${input.ownerType}: ${input.filename}`);
    this.name = 'DuplicateDocumentFilenameError';
    this.metadata = input;
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
  | DocumentNotFoundError
  | DocumentPolicyViolationError
  | DocumentStorageConflictError
  | DuplicateDocumentFilenameError;

export function isDocumentCoreError(error: unknown): error is DocumentCoreError {
  return (
    error instanceof DocumentNotFoundError ||
    error instanceof DocumentPolicyViolationError ||
    error instanceof DocumentStorageConflictError ||
    error instanceof DuplicateDocumentFilenameError
  );
}
