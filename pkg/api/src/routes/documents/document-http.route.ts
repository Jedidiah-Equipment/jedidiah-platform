import { Readable } from 'node:stream';

import {
  deleteDocument,
  getUserAccessSummary,
  isDocumentCoreError,
  readDocument,
  type StorageAdapter,
  uploadProductDocument,
} from '@pkg/core';
import { db } from '@pkg/db';
import { validateDocumentPolicy } from '@pkg/domain';
import { DocumentDeleteInput, DocumentDownloadInput, DocumentListByProductInput } from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../../auth/session.js';
import { mapDocumentCoreError } from './documents.router.js';

type RouteAuthContext = {
  access: Awaited<ReturnType<typeof getUserAccessSummary>>;
  session: AppSession;
};

export async function registerDocumentHttpRoutes(app: FastifyInstance, storage: StorageAdapter): Promise<void> {
  app.post('/api/documents/products/:productId', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      const params = DocumentListByProductInput.parse(request.params);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: 'Choose a document to upload.' });
        return;
      }

      const bytes = await file.toBuffer();
      const document = await mapHttpDocumentErrors(() =>
        uploadProductDocument({
          access: auth.access,
          actorUserId: auth.session.user.id,
          db,
          input: {
            bytes,
            contentType: file.mimetype,
            filename: file.filename,
            productId: params.productId,
          },
          storage,
        }),
      );

      reply.status(201).send(document);
    } catch (error) {
      sendHttpError(reply, error);
    }
  });

  app.get('/api/documents/:id/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      const params = DocumentDownloadInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readDocument({
          access: auth.access,
          db,
          id: params.id,
          storage,
        }),
      );

      reply.header('Content-Type', result.document.contentType);
      reply.header('Content-Length', result.document.byteSize);
      reply.header('Content-Disposition', createContentDisposition(result.document.filename));
      reply.send(Readable.from(result.object.body));
    } catch (error) {
      sendHttpError(reply, error);
    }
  });

  app.delete('/api/documents/:id', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      const params = DocumentDeleteInput.parse(request.params);
      await mapHttpDocumentErrors(() =>
        deleteDocument({
          access: auth.access,
          actorUserId: auth.session.user.id,
          db,
          id: params.id,
        }),
      );

      reply.status(204).send();
    } catch (error) {
      sendHttpError(reply, error);
    }
  });
}

async function requireRouteAuth(request: FastifyRequest, reply: FastifyReply): Promise<RouteAuthContext | null> {
  const session = await getSessionFromHeaders(request.headers);

  if (!session) {
    reply.status(401).send({ message: 'Please sign in to continue.' });
    return null;
  }

  const access = await getUserAccessSummary({
    db,
    role: parseBetterAuthRole(session.user.role),
    userId: session.user.id,
  });

  return { access, session };
}

async function mapHttpDocumentErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isDocumentCoreError(error)) {
      const mapped = mapDocumentCoreError(error);
      throw Object.assign(new Error(mapped.message), {
        appCode: mapped.appCode,
        statusCode: trpcCodeToHttpStatus(mapped.code),
      });
    }

    throw error;
  }
}

function sendHttpError(reply: FastifyReply, error: unknown): void {
  if (isMultipartFileTooLargeError(reply, error)) {
    const result = validateDocumentPolicy({
      byteSize: Number.MAX_SAFE_INTEGER,
      contentType: 'application/pdf',
      ownerType: 'product',
    });

    reply.status(400).send({
      data: {
        appCode: result.ok ? undefined : result.code,
      },
      message: result.ok ? 'Document is too large.' : result.message,
    });
    return;
  }

  if (error instanceof z.ZodError) {
    reply.status(400).send({ message: 'Invalid document request.' });
    return;
  }

  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    reply.status(error.statusCode).send({
      data: {
        appCode: 'appCode' in error ? error.appCode : undefined,
      },
      message: error instanceof Error ? error.message : 'Document request failed.',
    });
    return;
  }

  throw error;
}

function trpcCodeToHttpStatus(code: string): number {
  if (code === 'BAD_REQUEST') return 400;
  if (code === 'CONFLICT') return 409;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;

  return 500;
}

function createContentDisposition(filename: string): string {
  const fallback = filename.replace(/["\\\r\n]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');

  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

function isMultipartFileTooLargeError(reply: FastifyReply, error: unknown): boolean {
  return error instanceof reply.server.multipartErrors.RequestFileTooLargeError;
}
