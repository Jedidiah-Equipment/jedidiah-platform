import type { PushKind } from '@pkg/schema';
import { PUSH_KINDS } from '../push/push-kinds.js';

/** How a Contracting push rings: its Push Kind's channel, at high priority. */
export const alertFor = (kind: PushKind) =>
  ({ channelId: PUSH_KINDS[kind].channel.id, priority: 'high', sound: 'default' }) as const;
