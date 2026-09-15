import { translatingConstraintViolations } from '../errors/constraint-violations.js';

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
export const withDirectoryConstraints = <T>(duplicateMessage: string, action: () => Promise<T>) =>
  translatingConstraintViolations(
    {
      unique: () => new DirectoryError('directory.duplicate', duplicateMessage),
      foreignKey: () => new DirectoryError('directory.invalid_reference', 'The selected record no longer exists.'),
    },
    action,
  );
