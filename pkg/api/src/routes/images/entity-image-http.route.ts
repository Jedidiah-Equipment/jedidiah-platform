import { Readable } from 'node:stream';

import { ImageNotFoundError, ImagePolicyViolationError, isProductCoreError, type StoredObject } from '@pkg/core';
import { createUserAccessSummary, hasPermission } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../../auth/session.js';

type RouteAuthContext = {
  access: ReturnType<typeof createUserAccessSummary>;
  session: AppSession;
};

// Describes one entity's replace-in-place image routes. The registrar owns the shared transport
// concerns (auth, permission gating, multipart read, streaming, error mapping); the config supplies the
// entity-specific paths, permissions, and the core service calls. Each config parses the raw route
// params itself (it owns its param shape); a parse failure surfaces as a 400 through the shared mapper.
// Reuse for any entity that stores uploaded images in private object storage.
export type EntityImageRouteConfig = {
  downloadPath: string;
  noFileMessage: string;
  read: (args: { rawParams: unknown }) => Promise<StoredObject>;
  readForbiddenMessage: string;
  readPermission: AppPermission;
  replace: (args: { actorUserId: string; bytes: Buffer; rawParams: unknown }) => Promise<unknown>;
  uploadForbiddenMessage: string;
  uploadPath: string;
  uploadPermission: AppPermission;
};

// Registers every entity's image routes. Add a config to the list to give another entity image uploads.
export async function registerEntityImageRoutes(
  app: FastifyInstance,
  configs: readonly EntityImageRouteConfig[],
): Promise<void> {
  for (const config of configs) {
    registerEntityImageConfig(app, config);
  }
}

function registerEntityImageConfig(app: FastifyInstance, config: EntityImageRouteConfig): void {
  app.post(config.uploadPath, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, config.uploadPermission, config.uploadForbiddenMessage);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: config.noFileMessage });
        return;
      }

      const bytes = await file.toBuffer();
      const body = await config.replace({ actorUserId: auth.session.user.id, bytes, rawParams: request.params });

      reply.status(200).send(body);
    } catch (error) {
      sendImageHttpError(reply, error);
    }
  });

  app.get(config.downloadPath, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, config.readPermission, config.readForbiddenMessage);
      const object = await config.read({ rawParams: request.params });

      reply.header('Content-Type', object.contentType);
      reply.header('Content-Length', object.byteSize);
      return reply.send(Readable.from(object.body, { objectMode: false }));
    } catch (error) {
      sendImageHttpError(reply, error);
    }
  });
}

async function requireRouteAuth(request: FastifyRequest, reply: FastifyReply): Promise<RouteAuthContext | null> {
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

function requirePermission(auth: RouteAuthContext, permission: AppPermission, message: string): void {
  if (hasPermission(auth.access, permission)) {
    return;
  }

  throw Object.assign(new Error(message), {
    appCode: 'image.forbidden',
    statusCode: 403,
  });
}

function sendImageHttpError(reply: FastifyReply, error: unknown): void {
  if (isMultipartFileTooLargeError(reply, error)) {
    reply.status(400).send({
      data: { appCode: 'image.file_too_large' },
      message: 'Image is too large.',
    });
    return;
  }

  if (error instanceof ImagePolicyViolationError) {
    reply.status(400).send({ data: { appCode: error.code }, message: error.message });
    return;
  }

  if (error instanceof ImageNotFoundError) {
    reply.status(404).send({ data: { appCode: error.code }, message: 'Image not found.' });
    return;
  }

  // Owner-not-found (e.g. a missing Product) surfaces as the owner's core error.
  if (isProductCoreError(error)) {
    const notFound = error.code === 'product.not_found';
    reply.status(notFound ? 404 : 400).send({
      data: { appCode: error.code },
      message: notFound ? 'Product not found.' : error.message,
    });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({ message: 'Invalid image request.' });
    return;
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    reply.status(error.statusCode).send({
      data: { appCode: 'appCode' in error ? error.appCode : undefined },
      message: error instanceof Error ? error.message : 'Image request failed.',
    });
    return;
  }

  throw error;
}

function isMultipartFileTooLargeError(reply: FastifyReply, error: unknown): boolean {
  return error instanceof reply.server.multipartErrors.RequestFileTooLargeError;
}
