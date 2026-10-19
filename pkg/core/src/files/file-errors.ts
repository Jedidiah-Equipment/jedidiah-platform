import type { FilePolicyViolationCode } from '@pkg/domain';

// Errors for the generic stored-file service, shared by every entity that stores uploaded files. Owner-not
// -found (e.g. a missing Product) stays an entity-specific error raised by the binding; these cover only
// the file concerns the generic service owns.
export type FileErrorCode = FilePolicyViolationCode | 'file.not_found';

export class FileError extends Error {
  constructor(
    readonly code: FileErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FileError';
  }
}

export const isFileError = (error: unknown): error is FileError => error instanceof FileError;
export const filePolicyViolation = (violation: { code: FilePolicyViolationCode; message: string }) =>
  new FileError(violation.code, violation.message);
