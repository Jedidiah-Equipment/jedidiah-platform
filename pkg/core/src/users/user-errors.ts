export class UserNotFoundError extends Error {
  readonly code = 'user.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
    this.metadata = { id };
  }
}

export type UserCoreError = UserNotFoundError;

export function isUserCoreError(error: unknown): error is UserCoreError {
  return error instanceof UserNotFoundError;
}
