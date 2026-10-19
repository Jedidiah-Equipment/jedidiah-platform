import type { StoredObject } from '@pkg/core';
import type { FilePolicy } from '@pkg/domain';
import type { AppPermission } from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  mapCoreErrorToRoute,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
  streamObjectBody,
} from '@/routes/http-route-helpers.js';
import { fileErrorFamily } from '@/routes/shared-error-families.js';
import type { CoreErrorFamily } from '@/trpc/errors.js';

// Describes one entity's replace-in-place file routes. The registrar owns the shared transport
// concerns (auth, permission gating, multipart read, streaming, error mapping); the config supplies the
// entity-specific paths, permissions, core service calls, and the error families its owner raises (e.g. a
// missing Product). Each config parses the raw route params itself (it owns its param shape); a parse
// failure surfaces as a 400 through the shared mapper. Reuse for any entity that stores uploaded files
// in private object storage.
export type EntityFileRouteConfig = {
  downloadPath: string;
  // The families an owner error raised by the binding (e.g. a missing Product) belongs to, mapped like the
  // owner's tRPC router maps them. Keeps entity-specific error knowledge out of this generic registrar.
  ownerErrorFamilies: CoreErrorFamily[];
  noFileMessage: string;
  // Its cap is applied to the upload stream, so an oversized file is refused before it is buffered.
  policy: FilePolicy;
  read: (args: { rawParams: unknown; rawQuery: unknown }) => Promise<StoredObject>;
  readForbiddenMessage: string;
  readPermission: AppPermission;
  replace: (args: { actorUserId: string; bytes: Buffer; rawParams: unknown }) => Promise<unknown>;
  uploadForbiddenMessage: string;
  uploadPath: string;
  uploadPermission: AppPermission;
};

// Registers every entity's file routes. Add a config to the list to give another entity file uploads.
export async function registerEntityFileRoutes(
  app: FastifyInstance,
  configs: readonly EntityFileRouteConfig[],
): Promise<void> {
  for (const config of configs) {
    registerEntityFileConfig(app, config);
  }
}

function registerEntityFileConfig(app: FastifyInstance, config: EntityFileRouteConfig): void {
  app.post(config.uploadPath, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, config.uploadPermission, config.uploadForbiddenMessage, 'file.forbidden');
      const file = await request.file({ limits: { fileSize: config.policy.maxBytes } });

      if (!file) {
        reply.status(400).send({ message: config.noFileMessage });
        return;
      }

      const bytes = await file.toBuffer();
      const body = await config.replace({ actorUserId: auth.session.user.id, bytes, rawParams: request.params });

      reply.status(200).send(body);
    } catch (error) {
      sendFileHttpError(reply, error, config);
    }
  });

  app.get(config.downloadPath, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, config.readPermission, config.readForbiddenMessage, 'file.forbidden');
      const object = await config.read({ rawParams: request.params, rawQuery: request.query });

      reply.header('Content-Type', object.contentType);
      reply.header('Content-Length', object.byteSize);
      return reply.send(streamObjectBody(object.body));
    } catch (error) {
      sendFileHttpError(reply, error, config);
    }
  });
}

function sendFileHttpError(reply: FastifyReply, error: unknown, config: EntityFileRouteConfig): void {
  sendUploadHttpError(reply, mapCoreErrorToRoute(error, fileErrorFamily, ...config.ownerErrorFamilies), {
    policy: config.policy,
    fallbackMessage: 'File request failed.',
    invalidRequestMessage: 'Invalid file request.',
  });
}
