import type { AiContext, AiSession } from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';
import { log } from '@/logger.js';
import { deliverQuoteDraftEmail } from '@/routes/quotes/quote-draft-email.js';

export type AiContextDependencies = {
  storage: StorageAdapter;
};

export type CreateAiContextInput = {
  access: UserAccessSummary | null;
  db: AiContext['db'];
  session: AiSession | null;
  storage: StorageAdapter;
};

// The one place API-owned dependencies are injected into @pkg/ai; route every AiContext
// construction through here so call sites cannot drift.
export function createAiContext({ access, db, session, storage }: CreateAiContextInput): AiContext {
  return {
    access,
    db,
    deliverQuoteDraftEmail,
    log,
    session,
    storage,
  };
}

export async function buildAiContext(req: FastifyRequest, dependencies: AiContextDependencies): Promise<AiContext> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return createAiContext({ access, db, session, storage: dependencies.storage });
}
