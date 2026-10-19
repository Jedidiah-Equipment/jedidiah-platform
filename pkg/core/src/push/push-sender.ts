import type { Db } from '@pkg/db';
import type { PushContent } from '@pkg/domain';
import { prunePushTokens } from './push-token-service.js';

/** One push content addressed to one install's token. */
export type PushMessage = PushContent & { to: string };

export type PushOutcome = { to: string; ok: true } | { to: string; ok: false; error: string };

/** The transport, injected: Expo in the API, a recorder in tests. */
export type PushSender = (messages: readonly PushMessage[]) => Promise<PushOutcome[]>;

/** What one send came to; `failures` counts each reason the push service gave, never a token or a message. */
export type PushDelivery = { sent: number; pruned: number; failed: number; failures: Record<string, number> };

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
  if (messages.length === 0) return { sent: 0, pruned: 0, failed: 0, failures: {} };
  const outcomes = await sender(messages);
  const gone = outcomes.flatMap((outcome) =>
    !outcome.ok && outcome.error === PUSH_DEVICE_NOT_REGISTERED ? [outcome.to] : [],
  );
  const sent = outcomes.filter((outcome) => outcome.ok).length;
  const pruned = await prunePushTokens({ db, tokens: [...new Set(gone)] });
  const failures: Record<string, number> = {};
  for (const outcome of outcomes)
    if (!outcome.ok && outcome.error !== PUSH_DEVICE_NOT_REGISTERED)
      failures[outcome.error] = (failures[outcome.error] ?? 0) + 1;
  return { sent, pruned, failed: outcomes.length - sent - gone.length, failures };
}
