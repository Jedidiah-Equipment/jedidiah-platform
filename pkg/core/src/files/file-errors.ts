import type { FilePolicyViolationCode } from '@pkg/domain';

// Errors for the generic stored-file service, shared by every entity that stores uploaded files. Owner-not
// -found (e.g. a missing Product) stays an entity-specific error raised by the binding; these cover only
// the file concerns the generic service owns.
export class FilePolicyViolationError extends Error {
  readonly code: FilePolicyViolationCode;

  constructor(violation: { code: FilePolicyViolationCode; message: string }) {
    super(violation.message);
    this.name = 'FilePolicyViolationError';
    this.code = violation.code;
  }
}

export class FileNotFoundError extends Error {
  readonly code = 'file.not_found';
  readonly metadata: Record<string, string>;

  constructor(message: string, metadata: Record<string, string> = {}) {
    super(message);
    this.name = 'FileNotFoundError';
    this.metadata = metadata;
  }
}

export type FileCoreError = FileNotFoundError | FilePolicyViolationError;

export function isFileCoreError(error: unknown): error is FileCoreError {
  return error instanceof FileNotFoundError || error instanceof FilePolicyViolationError;
}
