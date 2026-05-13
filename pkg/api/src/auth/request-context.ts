import type { IncomingHttpHeaders } from "node:http";
import { type Database, db as defaultDb } from "@pkg/db";
import { createUserAccessSummary } from "@pkg/domain";
import type { UserAccessSummary } from "@pkg/schema";

import { type AppSession, getSessionFromHeaders } from "./session.js";

export type RequestContext = {
  access: UserAccessSummary | null;
  db: Database;
  session: AppSession | null;
};

export type RequestContextInput = {
  db?: Database;
  headers: IncomingHttpHeaders;
};

export type RequestContextSessionInput = {
  db?: Database;
  session: AppSession | null;
};

export async function createRequestContext({
  db = defaultDb,
  headers,
}: RequestContextInput): Promise<RequestContext> {
  const session = await getSessionFromHeaders(headers);

  return createRequestContextFromSession({
    db,
    session,
  });
}

export function createRequestContextFromSession({
  db = defaultDb,
  session,
}: RequestContextSessionInput): RequestContext {
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
