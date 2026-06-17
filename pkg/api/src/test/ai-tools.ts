import { type Db, user } from '@pkg/db';
import type { AppRole, UserAccessSummary } from '@pkg/schema';

import type { AiContext } from '@/routes/ai/ai-context.js';
import { mockSession } from '@/test/test-utils.js';

export function createAiContext(db: Db, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role),
    storage: {} as AiContext['storage'],
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
