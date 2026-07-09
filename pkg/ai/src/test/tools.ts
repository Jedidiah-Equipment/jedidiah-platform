import type { StorageAdapter } from '@pkg/core';
import { type Db, user } from '@pkg/db';
import type { AppRole, UserAccessSummary } from '@pkg/schema';
import { vi } from 'vitest';

import type { AiContext } from '../context.js';
import { MemoryStorage } from './create-tester.js';
import { createSilentLogger, mockSession } from './test-utils.js';

export function createAiContext(db: Db, access: UserAccessSummary | null): AiContext {
  return {
    access,
    brochureRenderer: vi.fn(async () => new Uint8Array()),
    db,
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session: mockSession(access?.role ?? 'admin'),
    storage: new MemoryStorage() as StorageAdapter,
  };
}

export async function createActorUser(db: Db, role: AppRole = 'admin') {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: 'test@example.com',
    emailVerified: true,
    id: 'test-user-id',
    name: 'Test User',
    role,
    updatedAt: now,
  });
}

export function createEmail(name: string): string {
  return `${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}@example.com`;
}

export function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
