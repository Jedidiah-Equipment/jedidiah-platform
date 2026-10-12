import type { Db } from '@pkg/db';
import { prunePushTokens } from './push-token-service.js';

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  channelId?: string;
  priority?: 'default' | 'high';
  sound?: 'default';
};

export type PushOutcome = { to: string; ok: true } | { to: string; ok: false; error: string };

/** The transport, injected: Expo in the API, a recorder in tests. */
export type PushSender = (messages: readonly PushMessage[]) => Promise<PushOutcome[]>;

export type PushDelivery = { sent: number; pruned: number; failed: number };

/** The push service's word for an install that is gone: uninstalled, or its token revoked. */
export const PUSH_DEVICE_NOT_REGISTERED = 'DeviceNotRegistered';

/** Sends and prunes tokens Expo reports as gone. Never throws for a per-message failure. */
export async function deliverPush({
  db,
  sender,
  messages,
}: {
  db: Db;
  sender: PushSender;
  messages: readonly PushMessage[];
}): Promise<PushDelivery> {
  if (messages.length === 0) return { sent: 0, pruned: 0, failed: 0 };
  const outcomes = await sender(messages);
  const gone = outcomes.flatMap((outcome) =>
    !outcome.ok && outcome.error === PUSH_DEVICE_NOT_REGISTERED ? [outcome.to] : [],
  );
  const sent = outcomes.filter((outcome) => outcome.ok).length;
  const pruned = await prunePushTokens({ db, tokens: [...new Set(gone)] });
  return { sent, pruned, failed: outcomes.length - sent - gone.length };
}
