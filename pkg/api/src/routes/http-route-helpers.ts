import { Readable } from 'node:stream';

import { FilePolicyViolationError } from '@pkg/core';
import { createUserAccessSummaryForUser, type FilePolicy, fileTooLargeMessage, hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import { TRPCError } from '@trpc/server';
import { getHTTPStatusCodeFromError } from '@trpc/server/http';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type AppSession, getSessionFromHeaders } from '../auth/session.js';
import type { CoreErrorFamily } from '../trpc/errors.js';

// Shared transport helpers for the file-upload/download HTTP routes (documents, images). These own the
// concerns every such route repeats — session auth, permission gating, body streaming, and turning a
// thrown error into a response — so each entity's route file stays focused on its own paths, permissions,
// and core-service calls. Entity-specific error mapping is supplied by the caller, never hardcoded here.

export type RouteAuthContext = {
  access: ReturnType<typeof createUserAccessSummaryForUser>;
  session: AppSession;
};

// A mapped HTTP failure with a stable status, public message, and optional `appCode`. Routes throw this
// (directly or by mapping a core error into one) so {@link sendHttpError} can render it uniformly.
export class RouteHttpError extends Error {
  readonly appCode: string | undefined;
  readonly statusCode: number;

  constructor({
    appCode,
    message,
    statusCode,
    cause,
  }: { appCode?: string; message: string; statusCode: number; cause?: unknown }) {
    super(message, { cause });
    this.name = 'RouteHttpError';
    this.appCode = appCode;
    this.statusCode = statusCode;
  }
}

// Maps a core error through the same families the tRPC routers use, so both transports agree on a
// status for every code. Anything no family owns is returned unchanged for the caller to handle.
export function mapCoreErrorToRoute(error: unknown, ...families: CoreErrorFamily[]): unknown {
  for (const family of families) {
    const mapping = family.match(error);
    if (mapping)
      return new RouteHttpError({
        appCode: mapping.appCode,
        cause: error,
        message: mapping.message,
        statusCode: getHTTPStatusCodeFromError(new TRPCError({ code: mapping.code })),
      });
  }
  return error;
}

// Resolves the session and access summary, or sends a 401 and returns null when there is no session.
export async function requireRouteAuth(request: FastifyRequest, reply: FastifyReply): Promise<RouteAuthContext | null> {
  const session = await getSessionFromHeaders(request.headers, request.server.auth.api);

  if (!session) {
    reply.status(401).send({ message: 'Please sign in to continue.' });
    return null;
  }

  return { access: createUserAccessSummaryForUser(session.user), session };
}

// Throws a 403 {@link RouteHttpError} unless the actor holds the permission.
export function requirePermission(
  auth: RouteAuthContext,
  permission: AppPermission,
  message: string,
  forbiddenCode: string,
): void {
  requireAnyPermission(auth, [permission], message, forbiddenCode);
}

// Throws a 403 unless the actor holds at least one permission. This models shared picker and
// generated-document reads that legitimately sit behind more than one workflow authority.
export function requireAnyPermission(
  auth: RouteAuthContext,
  permissions: readonly AppPermission[],
  message: string,
  forbiddenCode: string,
): void {
  if (permissions.some((permission) => hasPermission(auth.access, permission))) {
    return;
  }

  throw new RouteHttpError({ appCode: forbiddenCode, message, statusCode: 403 });
}

export type SendHttpErrorOptions = {
  // Public message for a request that carries a status but is not an `Error` (rare framework cases).
  fallbackMessage: string;
  // Public message for a malformed request (Zod parse failure).
  invalidRequestMessage: string;
};

export type SendUploadHttpErrorOptions = SendHttpErrorOptions & {
  // The route's own size cap words a stream refusal; the same policy's violations from core map to a 400.
  policy: FilePolicy;
};

// Renders a thrown route error into a response. Callers map their own core errors into a
// {@link RouteHttpError} before this point; this only knows mapped errors, malformed requests, and
// framework errors that already carry a status. Anything else rethrows so the default handler surfaces it as a 500.
export function sendHttpError(reply: FastifyReply, error: unknown, options: SendHttpErrorOptions): void {
  sendNonUploadHttpError(reply, error, options);
}

export function sendUploadHttpError(reply: FastifyReply, error: unknown, options: SendUploadHttpErrorOptions): void {
  if (isMultipartFileTooLargeError(reply, error)) {
    reply
      .status(400)
      .send({ data: { appCode: 'file.too_large' }, message: fileTooLargeMessage(options.policy.maxBytes) });
    return;
  }

  if (error instanceof FilePolicyViolationError) {
    reply.status(400).send({ data: { appCode: error.code }, message: error.message });
    return;
  }

  sendNonUploadHttpError(reply, error, options);
}

export type MultipartUploadOptions = {
  // The only field name a file part may carry; a file under any other name refuses the whole request.
  fileField: string;
  maxFiles: number;
  policy: FilePolicy;
  textFields: readonly string[];
  // The longest text field's schema cap, in characters; see {@link requireMaxLength}.
  fieldMaxLength: number;
  invalid: () => RouteHttpError;
};

// Reads an upload of text fields plus up to `maxFiles` complete files under one field name. Every text
// field arrives once and whole; a truncated or misnamed part refuses the request with the caller's error.
// The file-count and part-count limits leave one spare part so an extra file trips the files limit, not
// the parts limit.
export async function readMultipartUpload(
  request: FastifyRequest,
  { fileField, maxFiles, policy, textFields, fieldMaxLength, invalid }: MultipartUploadOptions,
): Promise<{ fields: Record<string, string>; files: Buffer[] }> {
  const fields: Record<string, string> = {};
  const files: Buffer[] = [];
  for await (const part of request.parts({
    limits: {
      files: maxFiles,
      fields: textFields.length,
      parts: textFields.length + maxFiles + 1,
      fileSize: policy.maxBytes,
      // Multipart caps bytes; the schema cap counts UTF-16 units, so allow the widest UTF-8 encoding.
      fieldSize: 4 * fieldMaxLength,
    },
  })) {
    if (part.type === 'file') {
      if (part.fieldname !== fileField) throw invalid();
      const bytes = await part.toBuffer();
      if (part.file.truncated) throw invalid();
      files.push(bytes);
    } else {
      if (part.fieldname in fields || part.valueTruncated || typeof part.value !== 'string') throw invalid();
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, files };
}

// A string schema's `.max()` cap, failing at route registration when the schema has lost it, so the
// multipart field limit is always derived from the schema rather than a local fallback.
export function requireMaxLength(schema: { maxLength: number | null }): number {
  if (schema.maxLength === null) throw new Error('Multipart text field schema must set a maximum length');
  return schema.maxLength;
}

function sendNonUploadHttpError(reply: FastifyReply, error: unknown, options: SendHttpErrorOptions): void {
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

export function createContentDisposition(
  filename: string,
  disposition: 'attachment' | 'inline' = 'attachment',
): string {
  const fallback = filename.replace(/["\\\r\n]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isMultipartFileTooLargeError(reply: FastifyReply, error: unknown): boolean {
  return Boolean(
    reply.server.multipartErrors && error instanceof reply.server.multipartErrors.RequestFileTooLargeError,
  );
}
