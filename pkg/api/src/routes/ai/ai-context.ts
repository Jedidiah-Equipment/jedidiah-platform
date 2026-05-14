import { db } from "@pkg/db";
import { createUserAccessSummary } from "@pkg/domain";
import type { AiContext as AiContextSchema, UserAccessSummary } from "@pkg/schema";
import type { FastifyRequest } from "fastify";

import { type AppSession, getSessionFromHeaders } from "@/auth/session.js";

export type AiContext = AiContextSchema<typeof db, AppSession>;

export async function buildAiContext(req: FastifyRequest): Promise<AiContext> {
  const session = await getSessionFromHeaders(req.headers);
  const access: UserAccessSummary | null = session
    ? createUserAccessSummary({
        role: session.user.role,
        userId: session.user.id,
      })
    : null;

  return {
    access,
    db,
    session,
  };
}
