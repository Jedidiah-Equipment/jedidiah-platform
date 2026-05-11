import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { getSessionFromHeaders } from "../auth/session.js";

export async function createContext({ req }: CreateFastifyContextOptions) {
  const session = await getSessionFromHeaders(req.headers);

  return {
    req,
    session,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
