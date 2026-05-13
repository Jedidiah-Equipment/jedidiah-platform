import { db } from "@pkg/db";
import { createUserAccessSummary } from "@pkg/domain";
import type { UserAccessSummary } from "@pkg/schema";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { getSessionFromHeaders } from "../auth/session.js";

export async function createContext({ req }: CreateFastifyContextOptions) {
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

export type Context = Awaited<ReturnType<typeof createContext>>;
