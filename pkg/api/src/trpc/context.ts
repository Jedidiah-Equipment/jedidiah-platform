import { createUserAccessSummary } from "@pkg/core";
import { db } from "@pkg/db";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth.js";
import { getSessionFromHeaders } from "../auth/session.js";

export async function createContext({ req }: CreateFastifyContextOptions) {
  const requestHeaders = fromNodeHeaders(req.headers);
  const session = await getSessionFromHeaders(req.headers);
  const access = session
    ? createUserAccessSummary({
        role: session.user.role,
        userId: session.user.id,
      })
    : null;

  return {
    access,
    auth,
    db,
    req,
    requestHeaders,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
