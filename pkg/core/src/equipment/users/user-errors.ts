export type UserDeviceErrorCode = 'user.is_device';

/** A badge card names a person, and `resolveMovementActor` refuses a device as the actor. */
export class UserDeviceError extends Error {
  constructor(
    readonly code: UserDeviceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'UserDeviceError';
  }
}

export const isUserDeviceError = (error: unknown): error is UserDeviceError => error instanceof UserDeviceError;
export const userIsDevice = (id: string) =>
  new UserDeviceError('user.is_device', `A shared device has no badge card: ${id}`);
