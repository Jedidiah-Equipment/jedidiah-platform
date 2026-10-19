import {
  type ChangelogCoreError,
  FileNotFoundError,
  isChangelogCoreError,
  isPushError,
  isUserNotFoundError,
  type PushError,
  type UserNotFoundError,
} from '@pkg/core';

import { defineCoreErrorFamily } from '../trpc/errors.js';

/** The error families of the shared roots, which either business's routers may surface. */

export const userErrorFamily = defineCoreErrorFamily<UserNotFoundError>({
  codes: { 'user.not_found': 'NOT_FOUND' },
  is: isUserNotFoundError,
  messages: { 'user.not_found': 'User not found.' },
});

export const changelogErrorFamily = defineCoreErrorFamily<ChangelogCoreError>({
  codes: { 'changelog.unknown_release': 'BAD_REQUEST' },
  is: isChangelogCoreError,
  messages: { 'changelog.unknown_release': 'That release could not be found.' },
});

export const fileErrorFamily = defineCoreErrorFamily<FileNotFoundError>({
  codes: { 'file.not_found': 'NOT_FOUND' },
  is: (error): error is FileNotFoundError => error instanceof FileNotFoundError,
  messages: { 'file.not_found': 'File not found.' },
});

export const pushErrorFamily = defineCoreErrorFamily<PushError>({
  codes: { 'push.device_account': 'FORBIDDEN' },
  is: isPushError,
});
