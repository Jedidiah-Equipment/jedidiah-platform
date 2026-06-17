import { Readable } from 'node:stream';

import { createUserAccessSummary, hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../auth/session.js';

// Shared transport helpers for the file-upload/download HTTP routes (documents, images). These own the
// concerns every such route repeats — session auth, permission gating, body streaming, and turning a
// thrown error into a response — so each entity's route file stays focused on its own paths, permissions,
// and core-service calls. Entity-specific error mapping is supplied by the caller, never hardcoded here.

export type RouteAuthContext = {
  access: ReturnType<typeof createUserAccessSummary>;
  session: AppSession;
};

// A mapped HTTP failure with a stable status, public message, and optional `appCode`. Routes throw this
// (directly or by mapping a core error into one) so {@link sendHttpError} can render it uniformly.
export class RouteHttpError extends Error {
  readonly appCode: string | undefined;
  readonly statusCode: number;

  constructor({ appCode, message, statusCode }: { appCode?: string; message: string; statusCode: number }) {
    super(message);
    this.name = 'RouteHttpError';
    this.appCode = appCode;
    this.statusCode = statusCode;
  }
}

// Resolves the session and access summary, or sends a 401 and returns null when there is no session.
export async function requireRouteAuth(request: FastifyRequest, reply: FastifyReply): Promise<RouteAuthContext | null> {
  const session = await getSessionFromHeaders(request.headers);

  if (!session) {
    reply.status(401).send({ message: 'Please sign in to continue.' });
    return null;
  }

  const access = createUserAccessSummary({
    role: parseBetterAuthRole(session.user.role),
    userId: session.user.id,
  });

  return { access, session };
}

// Throws a 403 {@link RouteHttpError} unless the actor holds the permission.
export function requirePermission(
  auth: RouteAuthContext,
  permission: AppPermission,
  message: string,
  forbiddenCode: string,
): void {
  if (hasPermission(auth.access, permission)) {
    return;
  }

  throw new RouteHttpError({ appCode: forbiddenCode, message, statusCode: 403 });
}

export type SendHttpErrorOptions = {
  // Public message for a request that carries a status but is not an `Error` (rare framework cases).
  fallbackMessage: string;
  // Public message for a malformed request (Zod parse failure).
  invalidRequestMessage: string;
  // Builds the response for an oversized multipart upload; entities word this for their own size cap.
  onFileTooLarge: () => { appCode: string | undefined; message: string };
};

// Renders a thrown route error into a response. Callers map their own core errors into a
// {@link RouteHttpError} before this point; this only knows the transport-level cases (oversized upload,
// our mapped errors, malformed request, and framework errors that already carry a status). Anything else
// rethrows so the server's default handler surfaces it as a 500.
export function sendHttpError(reply: FastifyReply, error: unknown, options: SendHttpErrorOptions): void {
  if (isMultipartFileTooLargeError(reply, error)) {
    const { appCode, message } = options.onFileTooLarge();
    reply.status(400).send({ data: { appCode }, message });
    return;
  }

  if (error instanceof RouteHttpError) {
    reply.status(error.statusCode).send({ data: { appCode: error.appCode }, message: error.message });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({ message: options.invalidRequestMessage });
    return;
  }

  // Framework errors (e.g. from multipart parsing) carry a numeric status; map them through rather than
  // treating them as unexpected 500s.
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    reply.status(error.statusCode).send({
      data: { appCode: 'appCode' in error ? error.appCode : undefined },
      message: error instanceof Error ? error.message : options.fallbackMessage,
    });
    return;
  }

  throw error;
}

// Streams a stored object's body as a binary response.
export function streamObjectBody(body: AsyncIterable<Uint8Array>): Readable {
  return Readable.from(body, { objectMode: false });
}

function isMultipartFileTooLargeError(reply: FastifyReply, error: unknown): boolean {
  return error instanceof reply.server.multipartErrors.RequestFileTooLargeError;
}
