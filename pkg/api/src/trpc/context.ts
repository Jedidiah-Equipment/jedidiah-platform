import { type Database, db } from "@pkg/db";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

import { createRequestContext } from "../auth/request-context.js";

export async function createContext({
  db: requestDb = db,
  req,
}: CreateFastifyContextOptions & { db?: Database }) {
  return createRequestContext({
    db: requestDb,
    headers: req.headers,
  });
}

export type Context = Awaited<ReturnType<typeof createContext>>;
