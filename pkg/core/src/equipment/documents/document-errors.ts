import type { DocumentPolicyViolationCode } from '@pkg/domain';
import type { DocumentOwnerType } from '@pkg/schema';

export class DuplicateDocumentFilenameError extends Error {
  readonly code = 'document.duplicate_filename';
  // Every owner type carries a per-owner filename uniqueness index, so every one of them can raise
  // this — taken from the schema's own set rather than a hand-kept subset that goes stale.
  readonly metadata: { filename: string; ownerId: string; ownerType: DocumentOwnerType };

  constructor(input: { filename: string; ownerId: string; ownerType: DocumentOwnerType }) {
    super(`Document filename already exists for ${input.ownerType}: ${input.filename}`);
    this.name = 'DuplicateDocumentFilenameError';
    this.metadata = input;
  }
}

export class DocumentDeleteNotAllowedError extends Error {
  readonly code = 'document.delete_not_allowed';
  readonly metadata: { id: string };

  constructor(id: string) {
    super('Only uploaded Purchase Orders can be deleted from a Job.');
    this.name = 'DocumentDeleteNotAllowedError';
    this.metadata = { id };
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
  | DocumentDeleteNotAllowedError
  | DocumentNotFoundError
  | DocumentPolicyViolationError
  | DocumentStorageConflictError
  | DuplicateDocumentFilenameError;

export function isDocumentCoreError(error: unknown): error is DocumentCoreError {
  return (
    error instanceof DocumentDeleteNotAllowedError ||
    error instanceof DocumentNotFoundError ||
    error instanceof DocumentPolicyViolationError ||
    error instanceof DocumentStorageConflictError ||
    error instanceof DuplicateDocumentFilenameError
  );
}
