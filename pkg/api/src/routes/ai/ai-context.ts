import { getUserAccessSummary } from '@pkg/core';
import { db } from '@pkg/db';
import type { AiContext as AiContextSchema, UserAccessSummary } from '@pkg/schema';
import type { FastifyRequest } from 'fastify';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '@/auth/session.js';

export type AiContext = AiContextSchema<typeof db, AppSession>;

export async function buildAiContext(req: FastifyRequest): Promise<AiContext> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? await getUserAccessSummary({
        db,
        role: parseBetterAuthRole(session.user.role),
        userId: session.user.id,
      })
    : null;

  return {
    access,
    db,
    session,
  };
}
