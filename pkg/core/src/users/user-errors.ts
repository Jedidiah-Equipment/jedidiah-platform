export type UserErrorCode = 'user.not_found';

export class UserError extends Error {
  constructor(
    readonly code: UserErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserError';
  }
}

export const isUserError = (error: unknown): error is UserError => error instanceof UserError;
export const userNotFound = (id: string) => new UserError('user.not_found', `User not found: ${id}`);
