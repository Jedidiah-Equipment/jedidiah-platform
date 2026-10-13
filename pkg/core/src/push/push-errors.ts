import type { PushErrorCode } from '@pkg/schema';

export class PushError extends Error {
  constructor(
    readonly code: PushErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PushError';
  }
}

export const isPushError = (error: unknown): error is PushError => error instanceof PushError;

/** A shared device account is never pinged, so it neither registers an install nor mutes a Push Kind. */
export function refuseDeviceAccount(account: { isDevice: boolean } | undefined): void {
  if (account?.isDevice)
    throw new PushError('push.device_account', 'A shared device account does not receive notifications.');
}
