import { createUserAccessSummary } from "@pkg/core";
import { db } from "@pkg/db";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { getSessionFromHeaders } from "../auth/session.js";

export async function createContext({ req }: CreateFastifyContextOptions) {
  const session = await getSessionFromHeaders(req.headers);
  const access = session
    ? createUserAccessSummary({
        role: (session.user as { role?: unknown }).role,
        userId: session.user.id,
      })
    : null;

  return {
    access,
    db,
    req,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
