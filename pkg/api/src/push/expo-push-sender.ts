import { PUSH_DEVICE_NOT_REGISTERED, type PushOutcome, type PushSender } from '@pkg/core';
import { Expo, type ExpoPushMessage } from 'expo-server-sdk';

/** The slice of the Expo client the sender uses, so a test can stand in for the push service. */
export type ExpoPushClient = Pick<Expo, 'chunkPushNotifications' | 'sendPushNotificationsAsync'>;

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
    const valid: ExpoPushMessage[] = messages.filter((message) => Expo.isExpoPushToken(message.to));
    const outcomes: PushOutcome[] = messages
      .filter((message) => !Expo.isExpoPushToken(message.to))
      .map((message) => ({ to: message.to, ok: false, error: PUSH_DEVICE_NOT_REGISTERED }));
    for (const chunk of expo.chunkPushNotifications(valid)) {
      try {
        const tickets = await expo.sendPushNotificationsAsync(chunk);
        tickets.forEach((ticket, index) => {
          const to = String(chunk[index]?.to);
          outcomes.push(
            ticket.status === 'ok'
              ? { to, ok: true }
              : { to, ok: false, error: ticket.details?.error ?? ticket.message },
          );
        });
      } catch (error) {
        for (const message of chunk)
          outcomes.push({
            to: String(message.to),
            ok: false,
            error: error instanceof Error ? error.message : 'send failed',
          });
      }
    }
    return outcomes;
  };
}
