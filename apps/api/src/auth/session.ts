import type { IncomingHttpHeaders } from "node:http";

import { fromNodeHeaders } from "better-auth/node";

import { auth } from "./auth.js";

export async function getSessionFromHeaders(headers: IncomingHttpHeaders) {
  return auth.api.getSession({
    headers: fromNodeHeaders(headers),
  });
}
