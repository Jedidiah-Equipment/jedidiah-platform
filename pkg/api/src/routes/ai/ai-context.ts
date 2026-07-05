import type { AiContext } from '@pkg/ai';
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
    deliverQuoteDraftEmail,
    log: log.ai,
    session,
    storage: dependencies.storage,
  };
}
