export class UserNotFoundError extends Error {
  readonly code = 'user.not_found';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
    this.metadata = { id };
  }
}

/**
 * A badge card names a person to the stores tablet's quick-switch, and a device can never be that
 * person — `resolveMovementActor` refuses one as the actor. Printing a card that could only ever be
 * rejected at the scan field would put a broken-looking badge on the bench.
 */
export class UserIsDeviceError extends Error {
  readonly code = 'user.is_device';
  readonly metadata: { id: string };

  constructor(id: string) {
    super(`A shared device has no badge card: ${id}`);
    this.name = 'UserIsDeviceError';
    this.metadata = { id };
  }
}

export type UserCoreError = UserIsDeviceError | UserNotFoundError;

export function isUserCoreError(error: unknown): error is UserCoreError {
  return error instanceof UserIsDeviceError || error instanceof UserNotFoundError;
}
