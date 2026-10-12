import type { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';
import { describe, expect, it } from 'vitest';
import { createExpoPushSender, type ExpoPushClient } from './expo-push-sender.js';

const message = (to: string) => ({ to, title: 'Code Red · JD6140M-2', body: 'Hydraulic leak.', data: {} });

function fakeExpo(
  answer: (chunk: ExpoPushMessage[]) => ExpoPushTicket[] | Error,
  chunkSize = 1,
): ExpoPushClient & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    chunkPushNotifications: (messages) =>
      messages.flatMap((_, index) => (index % chunkSize === 0 ? [messages.slice(index, index + chunkSize)] : [])),
    sendPushNotificationsAsync: async (chunk) => {
      sent.push(...chunk.map((single) => String(single.to)));
      const result = answer(chunk);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('createExpoPushSender', () => {
  it('reports one outcome per message in Expo’s words, and a malformed token as gone without sending it', async () => {
    const expo = fakeExpo(([single]) =>
      single?.to === 'ExponentPushToken[gone]'
        ? [{ status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }]
        : [{ status: 'ok', id: 'receipt' }],
    );
    const send = createExpoPushSender({ expo });

    const outcomes = await send([
      message('ExponentPushToken[ok]'),
      message('ExponentPushToken[gone]'),
      message('junk'),
    ]);

    expect(expo.sent).toEqual(['ExponentPushToken[ok]', 'ExponentPushToken[gone]']);
    expect(outcomes).toEqual(
      expect.arrayContaining([
        { to: 'ExponentPushToken[ok]', ok: true },
        { to: 'ExponentPushToken[gone]', ok: false, error: 'DeviceNotRegistered' },
        { to: 'junk', ok: false, error: 'DeviceNotRegistered' },
      ]),
    );
  });

  it('answers each token with its own ticket across chunks of several messages', async () => {
    const ticket = (single: ExpoPushMessage): ExpoPushTicket =>
      single.to === 'ExponentPushToken[gone]'
        ? { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }
        : { status: 'ok', id: 'receipt' };
    const expo = fakeExpo((chunk) => chunk.map(ticket), 2);
    const send = createExpoPushSender({ expo });

    const outcomes = await send(['a', 'gone', 'b', 'c', 'd'].map((name) => message(`ExponentPushToken[${name}]`)));

    expect(outcomes).toEqual([
      { to: 'ExponentPushToken[a]', ok: true },
      { to: 'ExponentPushToken[gone]', ok: false, error: 'DeviceNotRegistered' },
      { to: 'ExponentPushToken[b]', ok: true },
      { to: 'ExponentPushToken[c]', ok: true },
      { to: 'ExponentPushToken[d]', ok: true },
    ]);
  });

  it('fails each message of a chunk the push service refused outright, without throwing', async () => {
    const send = createExpoPushSender({ expo: fakeExpo(() => new Error('Expo is down')) });

    expect(await send([message('ExponentPushToken[a]')])).toEqual([
      { to: 'ExponentPushToken[a]', ok: false, error: 'Expo is down' },
    ]);
  });
});
