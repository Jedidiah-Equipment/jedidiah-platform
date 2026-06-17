import { ImageNotFoundError, ImagePolicyViolationError, type StoredObject } from '@pkg/core';
import type { AppPermission } from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendHttpError,
  streamObjectBody,
} from '../http-route-helpers.js';

// Re-exported so an entity's route config can build its owner-error mapping from one import.
export { RouteHttpError } from '../http-route-helpers.js';

// Describes one entity's replace-in-place image routes. The registrar owns the shared transport
// concerns (auth, permission gating, multipart read, streaming, error mapping); the config supplies the
// entity-specific paths, permissions, core service calls, and how to map its own owner errors (e.g. a
// missing Product). Each config parses the raw route params itself (it owns its param shape); a parse
// failure surfaces as a 400 through the shared mapper. Reuse for any entity that stores uploaded images
// in private object storage.
export type EntityImageRouteConfig = {
  downloadPath: string;
  // Maps an owner error raised by the binding (e.g. ProductNotFoundError) to a route response, or returns
  // undefined to let it propagate. Keeps entity-specific error knowledge out of this generic registrar.
  mapOwnerError: (error: unknown) => RouteHttpError | undefined;
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
      requirePermission(auth, config.uploadPermission, config.uploadForbiddenMessage, 'image.forbidden');
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: config.noFileMessage });
        return;
      }

      const bytes = await file.toBuffer();
      const body = await config.replace({ actorUserId: auth.session.user.id, bytes, rawParams: request.params });

      reply.status(200).send(body);
    } catch (error) {
      sendImageHttpError(reply, error, config);
    }
  });

  app.get(config.downloadPath, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, config.readPermission, config.readForbiddenMessage, 'image.forbidden');
      const object = await config.read({ rawParams: request.params });

      reply.header('Content-Type', object.contentType);
      reply.header('Content-Length', object.byteSize);
      return reply.send(streamObjectBody(object.body));
    } catch (error) {
      sendImageHttpError(reply, error, config);
    }
  });
}

function sendImageHttpError(reply: FastifyReply, error: unknown, config: EntityImageRouteConfig): void {
  sendHttpError(reply, toImageRouteError(error, config) ?? error, {
    fallbackMessage: 'Image request failed.',
    invalidRequestMessage: 'Invalid image request.',
    onFileTooLarge: () => ({ appCode: 'image.file_too_large', message: 'Image is too large.' }),
  });
}

// Maps the generic image errors this layer owns, then defers owner-not-found and the like to the config.
function toImageRouteError(error: unknown, config: EntityImageRouteConfig): RouteHttpError | undefined {
  if (error instanceof ImagePolicyViolationError) {
    return new RouteHttpError({ appCode: error.code, message: error.message, statusCode: 400 });
  }

  if (error instanceof ImageNotFoundError) {
    return new RouteHttpError({ appCode: error.code, message: 'Image not found.', statusCode: 404 });
  }

  return config.mapOwnerError(error);
}
