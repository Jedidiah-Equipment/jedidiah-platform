import { isUserNotFoundError, type UserNotFoundError } from '@pkg/core';
import { type CoreErrorMapping, mapKnownCoreError } from '@/trpc/errors.js';

export async function mapUserErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapKnownCoreError(action, isUserNotFoundError, mapUserNotFoundError);
}

function mapUserNotFoundError(_error: UserNotFoundError): CoreErrorMapping<'user.not_found'> {
  return {
    appCode: 'user.not_found',
    code: 'NOT_FOUND',
    message: 'User not found.',
  };
}
