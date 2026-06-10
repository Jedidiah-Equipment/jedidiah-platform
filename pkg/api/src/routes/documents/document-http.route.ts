import { Readable } from 'node:stream';

import {
  createProductDocument,
  isDocumentCoreError,
  isJobCoreError,
  isProductCoreError,
  isQuoteCoreError,
  readJobDocument,
  readProductDocument,
  readQuoteDocument,
  readQuoteProductBrochure,
  type StorageAdapter,
} from '@pkg/core';
import { db } from '@pkg/db';
import { createUserAccessSummary, hasPermission, validateDocumentPolicy } from '@pkg/domain';
import {
  type AppPermission,
  DocumentListByProductInput,
  ProductDocumentInput,
  QuoteDocumentInput,
  QuoteProductBrochureInput,
  UUID,
} from '@pkg/schema';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { type AppSession, getSessionFromHeaders, parseBetterAuthRole } from '../../auth/session.js';
import { mapDocumentCoreError } from './documents.router.js';

const JobDocumentRouteInput = z.object({
  documentId: UUID,
  jobId: UUID,
});

type RouteAuthContext = {
  access: ReturnType<typeof createUserAccessSummary>;
  session: AppSession;
};

export async function registerDocumentHttpRoutes(app: FastifyInstance, storage: StorageAdapter): Promise<void> {
  app.post('/api/products/:productId/documents', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, 'product:update', 'You do not have permission to upload Product documents.');
      const params = DocumentListByProductInput.parse(request.params);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: 'Choose a document to upload.' });
        return;
      }

      const bytes = await file.toBuffer();
      const document = await mapHttpDocumentErrors(() =>
        createProductDocument({
          actorUserId: auth.session.user.id,
          db,
          input: {
            bytes,
            contentType: file.mimetype,
            filename: file.filename,
            metadata: { type: readMultipartTextField(file.fields.type) },
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

  app.get('/api/products/:productId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, 'product:read', 'You do not have permission to download this document.');
      const params = ProductDocumentInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readProductDocument({
          db,
          documentId: params.documentId,
          productId: params.productId,
          storage,
        }),
      );

      reply.header('Content-Type', result.document.contentType);
      reply.header('Content-Length', result.document.byteSize);
      reply.header('Content-Disposition', createContentDisposition(result.document.filename));
      return reply.send(createDocumentBodyStream(result.object.body));
    } catch (error) {
      sendHttpError(reply, error);
    }
  });

  app.get('/api/jobs/:jobId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, 'job:read', 'You do not have permission to download this document.');
      const params = JobDocumentRouteInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readJobDocument({
          db,
          documentId: params.documentId,
          jobId: params.jobId,
          storage,
        }),
      );

      reply.header('Content-Type', result.document.contentType);
      reply.header('Content-Length', result.document.byteSize);
      reply.header('Content-Disposition', createContentDisposition(result.document.filename));
      return reply.send(createDocumentBodyStream(result.object.body));
    } catch (error) {
      sendHttpError(reply, error);
    }
  });

  app.get('/api/quotes/:quoteId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, 'quote:read', 'You do not have permission to download this document.');
      const params = QuoteDocumentInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readQuoteDocument({
          db,
          documentId: params.documentId,
          quoteId: params.quoteId,
          storage,
        }),
      );

      reply.header('Content-Type', result.document.contentType);
      reply.header('Content-Length', result.document.byteSize);
      reply.header('Content-Disposition', createContentDisposition(result.document.filename));
      return reply.send(createDocumentBodyStream(result.object.body));
    } catch (error) {
      sendHttpError(reply, error);
    }
  });

  app.get('/api/quotes/:quoteId/product-brochure/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(auth, 'quote:read', 'You do not have permission to download this document.');
      const params = QuoteProductBrochureInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readQuoteProductBrochure({
          db,
          documentId: params.documentId,
          quoteId: params.quoteId,
          storage,
        }),
      );

      reply.header('Content-Type', result.document.contentType);
      reply.header('Content-Length', result.document.byteSize);
      reply.header('Content-Disposition', createContentDisposition(result.document.filename));
      return reply.send(createDocumentBodyStream(result.object.body));
    } catch (error) {
      sendHttpError(reply, error);
    }
  });
}

const MultipartTextField = z.object({ type: z.literal('field'), value: z.string() }).transform((field) => field.value);

function readMultipartTextField(field: unknown): string | undefined {
  return MultipartTextField.safeParse(Array.isArray(field) ? field[0] : field).data;
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
    appCode: 'document.forbidden',
    statusCode: 403,
  });
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

    if (isProductCoreError(error)) {
      throw Object.assign(new Error(error.code === 'product.not_found' ? 'Product not found.' : error.message), {
        appCode: error.code,
        statusCode: error.code === 'product.not_found' ? 404 : 400,
      });
    }

    if (isJobCoreError(error)) {
      throw Object.assign(new Error(error.code === 'job.not_found' ? 'Job not found.' : error.message), {
        appCode: error.code,
        statusCode: error.code === 'job.not_found' ? 404 : 403,
      });
    }

    if (isQuoteCoreError(error)) {
      throw Object.assign(new Error(error.code === 'quote.not_found' ? 'Quote not found.' : error.message), {
        appCode: error.code,
        statusCode: error.code === 'quote.not_found' ? 404 : 400,
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

function createDocumentBodyStream(body: AsyncIterable<Uint8Array>): Readable {
  return Readable.from(body, { objectMode: false });
}

function isMultipartFileTooLargeError(reply: FastifyReply, error: unknown): boolean {
  return error instanceof reply.server.multipartErrors.RequestFileTooLargeError;
}
