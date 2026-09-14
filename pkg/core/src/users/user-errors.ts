export class UserNotFoundError extends Error {
  readonly code = 'user.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
    this.metadata = { id };
  }
}

export function isUserNotFoundError(error: unknown): error is UserNotFoundError {
  return error instanceof UserNotFoundError;
}
