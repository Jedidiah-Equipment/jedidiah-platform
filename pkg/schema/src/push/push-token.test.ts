import { describe, expect, it } from 'vitest';
import { ExpoPushToken } from './push-token.js';

describe('ExpoPushToken', () => {
  it('accepts both Expo token spellings and refuses anything else', () => {
    expect(ExpoPushToken.safeParse('ExponentPushToken[abc123]').success).toBe(true);
    expect(ExpoPushToken.safeParse('ExpoPushToken[abc123]').success).toBe(true);
    expect(ExpoPushToken.safeParse('ExponentPushToken[]').success).toBe(false);
    expect(ExpoPushToken.safeParse('fcm-device-token').success).toBe(false);
  });
});
