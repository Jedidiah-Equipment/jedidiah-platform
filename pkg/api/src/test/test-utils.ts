import type { ContractingRole, EquipmentRole, Logger } from '@pkg/schema';
import pino from 'pino';
import { expect } from 'vitest';
import { z } from 'zod';

import type { Context } from '@/trpc/context.js';

export function mockSession(role: EquipmentRole | null = 'admin'): NonNullable<Context['session']> {
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

/** A session for one Contracting user: the id signs the writes, the role decides what they may do. */
export function sessionAs(id: string, role: ContractingRole): NonNullable<Context['session']> {
  const session = mockSession(null);
  session.user.id = id;
  session.session.userId = id;
  session.user.contractingRole = role;
  return session;
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
