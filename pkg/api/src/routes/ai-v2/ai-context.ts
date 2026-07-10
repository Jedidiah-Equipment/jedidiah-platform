import type { AiV2Context, AiV2Session } from '@pkg/ai';
import { db } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';
import { log } from '@/logger.js';

export type CreateAiV2ContextInput = {
  access: UserAccessSummary | null;
  db: AiV2Context['db'];
  session: AppSession | null;
};

// Projects the full Better Auth session onto the minimal shape the AI runtime needs. `assistantEnabled`
// (a nullable additional field) is normalized to a definite boolean for the stream route's access gate.
export function toAiV2Session(session: AppSession | null): AiV2Session | null {
  return session
    ? {
        user: {
          id: session.user.id,
          email: session.user.email,
          assistantEnabled: session.user.assistantEnabled === true,
        },
      }
    : null;
}

// V2 keeps its minimal API-owned dependency injection beside the v2 transport so this route does
// not depend on the legacy AI route folder or its document and email delivery ports.
export function createAiV2Context({ access, db, session }: CreateAiV2ContextInput): AiV2Context {
  return {
    access,
    db,
    log,
    session: toAiV2Session(session),
  };
}

export async function buildAiV2Context(req: FastifyRequest): Promise<AiV2Context> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return createAiV2Context({ access, db, session });
}
