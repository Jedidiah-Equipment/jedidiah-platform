import type { DocumentPolicyViolationCode } from '@pkg/domain/equipment';
import type { DocumentOwnerType } from '@pkg/schema/equipment';

export type DocumentErrorCode =
  | DocumentPolicyViolationCode
  | 'document.delete_not_allowed'
  | 'document.duplicate_filename'
  | 'document.not_found'
  | 'document.storage_key_conflict';

export class DocumentError extends Error {
  constructor(
    readonly code: DocumentErrorCode,
    message: string,
    /** The owner a `duplicate_filename` collided under, which the public message names. */
    readonly ownerType?: DocumentOwnerType,
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

export const isDocumentError = (error: unknown): error is DocumentError => error instanceof DocumentError;
export const documentNotFound = (id: string) => new DocumentError('document.not_found', `Document not found: ${id}`);
export const documentDeleteNotAllowed = () =>
  new DocumentError('document.delete_not_allowed', 'Only uploaded Purchase Orders can be deleted from a Job.');
export const documentPolicyViolation = (violation: { code: DocumentPolicyViolationCode; message: string }) =>
  new DocumentError(violation.code, violation.message);
export const documentStorageConflict = () =>
  new DocumentError('document.storage_key_conflict', 'Generated document storage key already exists.');

// Every owner type carries a per-owner filename uniqueness index, so every one of them can raise this.
export const duplicateDocumentFilename = (input: { filename: string; ownerType: DocumentOwnerType }) =>
  new DocumentError(
    'document.duplicate_filename',
    `Document filename already exists for ${input.ownerType}: ${input.filename}`,
    input.ownerType,
  );
