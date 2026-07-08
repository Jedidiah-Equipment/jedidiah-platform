import type { AppRole, Logger } from '@pkg/schema';
import pino from 'pino';
import { expect } from 'vitest';
import { z } from 'zod';

import type { Context } from '@/trpc/context.js';

export function mockSession(role: AppRole = 'admin'): NonNullable<Context['session']> {
  return {
    session: {
      id: 'test-session-id',
      userId: 'test-user-id',
      token: 'test-token',
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@example.com',
      emailVerified: true,
      image: null,
      role,
      assistantEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as NonNullable<Context['session']>;
}

export function expectIsoDatetime(value: unknown): asserts value is string {
  expect(z.iso.datetime().safeParse(value).success).toBe(true);
}

export function createSilentLogger(): Logger {
  const silent = pino({ level: 'silent' });

  return {
    ai: silent,
    http: silent,
    root: silent,
    service: silent,
  };
}
