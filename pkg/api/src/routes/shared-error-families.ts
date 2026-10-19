import {
  type ChangelogError,
  type FileError,
  isChangelogError,
  isFileError,
  isPushError,
  isUserError,
  type PushError,
  type UserError,
} from '@pkg/core';

import { defineCoreErrorFamily } from '../trpc/errors.js';

/** The error families of the shared roots, which either business's routers may surface. */

export const userErrorFamily = defineCoreErrorFamily<UserError>({
  codes: { 'user.not_found': 'NOT_FOUND' },
  is: isUserError,
  messages: { 'user.not_found': 'User not found.' },
});

export const changelogErrorFamily = defineCoreErrorFamily<ChangelogError>({
  codes: { 'changelog.unknown_release': 'BAD_REQUEST' },
  is: isChangelogError,
  messages: { 'changelog.unknown_release': 'That release could not be found.' },
});

export const fileErrorFamily = defineCoreErrorFamily<FileError>({
  codes: {
    'file.content_type_not_allowed': 'BAD_REQUEST',
    'file.not_found': 'NOT_FOUND',
    'file.too_large': 'BAD_REQUEST',
  },
  is: isFileError,
  messages: { 'file.not_found': 'File not found.' },
});

export const pushErrorFamily = defineCoreErrorFamily<PushError>({
  codes: { 'push.device_account': 'FORBIDDEN' },
  is: isPushError,
});
