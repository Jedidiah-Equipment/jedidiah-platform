import {
  createUserAccessSummary,
  isPushRecipient,
  type PushChannel,
  parseRoleSlots,
  pushChannelsFor,
  pushKindsFor,
} from '@pkg/domain';
import type { PushKind } from '@pkg/schema';

export type PushAudience = {
  userId: string;
  /** The Push Kinds the signed-in person's roles can receive, in registry order. */
  kinds: readonly PushKind[];
  channels: readonly PushChannel[];
  /** Whether any kind reaches them: the only people asked for notification permission. */
  mayAsk: boolean;
  /** A shared device account, which no kind ever reaches whatever its role. */
  isDevice: boolean;
};

export function pushAudienceFor(user: {
  id: string;
  role?: string | null;
  contractingRole?: string | null;
  isDevice?: boolean | null;
}): PushAudience {
  if (user.isDevice) return { userId: user.id, kinds: [], channels: [], mayAsk: false, isDevice: true };
  const access = createUserAccessSummary({ ...parseRoleSlots(user), userId: user.id });
  return {
    userId: user.id,
    kinds: pushKindsFor(access),
    channels: pushChannelsFor(access),
    mayAsk: isPushRecipient(access),
    isDevice: false,
  };
}
