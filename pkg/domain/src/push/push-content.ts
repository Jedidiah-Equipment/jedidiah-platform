import type { PushData, PushKind } from '@pkg/schema';
import { PUSH_KINDS, type PushChannel } from './push-kinds.js';

/** How a push rings: its Push Kind's Android channel, at high priority, with the default sound. */
export type PushAlert = { channelId: PushChannel['id']; priority: 'high'; sound: 'default' };

/**
 * What a push says, the record it names and how it rings. Every business's push builders return this; the sender
 * adds only the token. `data` names the record, never money.
 */
export type PushContent = { title: string; body: string; data: PushData } & PushAlert;

export const pushAlert = (kind: PushKind): PushAlert => ({
  channelId: PUSH_KINDS[kind].channel.id,
  priority: 'high',
  sound: 'default',
});
