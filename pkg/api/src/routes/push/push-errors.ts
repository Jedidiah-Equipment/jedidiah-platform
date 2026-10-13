import { isPushError, type PushError } from '@pkg/core';
import { defineCoreErrorFamily } from '../../trpc/errors.js';

export const pushErrorFamily = defineCoreErrorFamily<PushError>({
  codes: { 'push.device_account': 'FORBIDDEN' },
  is: isPushError,
});
