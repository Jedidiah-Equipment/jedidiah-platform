import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { AiContext as AiContextSchema, UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';

export type AiContext = AiContextSchema<typeof db, AppSession> & {
  storage: StorageAdapter;
};

export type AiContextDependencies = {
  storage: StorageAdapter;
};

export async function buildAiContext(req: FastifyRequest, dependencies: AiContextDependencies): Promise<AiContext> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return {
    access,
    db,
    session,
    storage: dependencies.storage,
  };
}
