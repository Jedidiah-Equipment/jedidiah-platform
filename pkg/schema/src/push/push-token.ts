import { z } from 'zod';

export const pushPlatforms = ['ios', 'android'] as const;
export type PushPlatform = (typeof pushPlatforms)[number];

/** The address Expo's push service gives one install: `ExponentPushToken[…]`, or the newer `ExpoPushToken[…]`. */
export const ExpoPushToken = z.string().regex(/^Expo(nent)?PushToken\[[^\]]+\]$/, 'Not an Expo push token');

export type PushTokenRegisterInput = z.infer<typeof PushTokenRegisterInput>;
export const PushTokenRegisterInput = z.object({ token: ExpoPushToken, platform: z.enum(pushPlatforms) }).strict();

export const pushErrorCodes = ['push.device_account'] as const;
export type PushErrorCode = (typeof pushErrorCodes)[number];
