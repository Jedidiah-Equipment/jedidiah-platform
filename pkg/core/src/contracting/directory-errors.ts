import { getForeignKeyViolationConstraint, isUniqueViolation } from '@pkg/db';

export type DirectoryErrorCode =
  | 'directory.not_found'
  | 'directory.duplicate'
  | 'directory.in_use'
  | 'directory.invalid_reference';
export class DirectoryError extends Error {
  constructor(
    readonly code: DirectoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DirectoryError';
  }
}
export function isDirectoryError(error: unknown): error is DirectoryError {
  return error instanceof DirectoryError;
}
export async function withDirectoryConstraints<T>(duplicateMessage: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUniqueViolation(error)) throw new DirectoryError('directory.duplicate', duplicateMessage);
    if (getForeignKeyViolationConstraint(error))
      throw new DirectoryError('directory.invalid_reference', 'The selected record no longer exists.');
    throw error;
  }
}
