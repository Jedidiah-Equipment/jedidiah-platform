import { PUSH_DEVICE_NOT_REGISTERED, type PushMessage, type PushOutcome, type PushSender } from '@pkg/core';
import { Expo, type ExpoPushTicket } from 'expo-server-sdk';

/** The slice of the Expo client the sender uses, so a test can stand in for the push service. */
export type ExpoPushClient = Pick<Expo, 'chunkPushNotifications' | 'sendPushNotificationsAsync'>;

const outcomeOf = (to: string, ticket: ExpoPushTicket | undefined): PushOutcome => {
  if (!ticket) return { to, ok: false, error: 'no ticket' };
  return ticket.status === 'ok' ? { to, ok: true } : { to, ok: false, error: ticket.details?.error ?? ticket.message };
};

/**
 * Sends through Expo's push service and reports one outcome per message, in Expo's words. A token Expo would not
 * accept is reported gone so it is pruned; a chunk that fails outright fails each of its messages, never the batch.
 * No receipt polling: a ticket's `ok` is as far as delivery is followed.
 */
export function createExpoPushSender({
  accessToken,
  expo = new Expo(accessToken ? { accessToken } : {}),
}: {
  accessToken?: string | undefined;
  expo?: ExpoPushClient;
}): PushSender {
  return async (messages) => {
    const outcomes: PushOutcome[] = [];
    const accepted: PushMessage[] = [];
    for (const message of messages) {
      if (Expo.isExpoPushToken(message.to)) accepted.push(message);
      else outcomes.push({ to: message.to, ok: false, error: PUSH_DEVICE_NOT_REGISTERED });
    }
    // Expo chunks `accepted` into consecutive slices, so each ticket's recipient is read back from there, as the
    // single token a PushMessage carries.
    let offset = 0;
    for (const chunk of expo.chunkPushNotifications(accepted)) {
      const batch = accepted.slice(offset, offset + chunk.length);
      offset += chunk.length;
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        outcomes.push(...batch.map((message, index) => outcomeOf(message.to, tickets[index])));
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'send failed';
        outcomes.push(...batch.map((message): PushOutcome => ({ to: message.to, ok: false, error: reason })));
      }
    }
    return outcomes;
  };
}
