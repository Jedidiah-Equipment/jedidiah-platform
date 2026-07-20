import {
  createJobPurchaseOrder,
  createProductDocument,
  isDocumentCoreError,
  isJobCoreError,
  isProductCoreError,
  isQuoteCoreError,
  readJobDocument,
  readProductDocument,
  readQuoteDocument,
  renderProductBrochurePreview,
  type StorageAdapter,
} from '@pkg/core';
import { db } from '@pkg/db';
import { validateDocumentPolicy } from '@pkg/domain';
import { renderBrochurePdf } from '@pkg/pdf';
import { DocumentListByProductInput, JobDocumentInput, ProductDocumentInput, QuoteDocumentInput } from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  RouteHttpError,
  requireAnyPermission,
  requirePermission,
  requireRouteAuth,
  sendHttpError,
  streamObjectBody,
} from '../http-route-helpers.js';
import { mapDocumentCoreError } from './documents.router.js';

const JobDocumentUploadInput = JobDocumentInput.pick({ jobId: true });

export async function registerDocumentHttpRoutes(app: FastifyInstance, storage: StorageAdapter): Promise<void> {
  app.post('/api/products/:productId/documents', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'product:update',
        'You do not have permission to upload Product documents.',
        'document.forbidden',
      );
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
      sendDocumentHttpError(reply, error);
    }
  });

  app.get('/api/products/:productId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'product:read',
        'You do not have permission to download this document.',
        'document.forbidden',
      );
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
      return reply.send(streamObjectBody(result.object.body));
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  app.get('/api/products/:productId/brochure-preview', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requireAnyPermission(
        auth,
        ['product:read', 'quote:create'],
        'You do not have permission to preview this brochure.',
        'document.forbidden',
      );
      const params = DocumentListByProductInput.parse(request.params);
      const preview = await mapHttpDocumentErrors(() =>
        renderProductBrochurePreview({
          db,
          pdfRenderer: renderBrochurePdf,
          productId: params.productId,
          storage,
        }),
      );

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', preview.bytes.byteLength);
      reply.header('Content-Disposition', createContentDisposition(preview.filename, 'inline'));
      return reply.send(Buffer.from(preview.bytes));
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  app.post('/api/jobs/:jobId/documents', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'job:update',
        'You do not have permission to upload Job documents.',
        'document.forbidden',
      );
      const params = JobDocumentUploadInput.parse(request.params);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: 'Choose a document to upload.' });
        return;
      }

      const bytes = await file.toBuffer();
      const document = await mapHttpDocumentErrors(() =>
        createJobPurchaseOrder({
          actorUserId: auth.session.user.id,
          bytes,
          db,
          filename: file.filename,
          jobId: params.jobId,
          storage,
        }),
      );

      reply.status(201).send(document);
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  app.get('/api/jobs/:jobId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'job:read',
        'You do not have permission to download this document.',
        'document.forbidden',
      );
      const params = JobDocumentInput.parse(request.params);
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
      return reply.send(streamObjectBody(result.object.body));
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  app.get('/api/quotes/:quoteId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'quote:read',
        'You do not have permission to download this document.',
        'document.forbidden',
      );
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
      return reply.send(streamObjectBody(result.object.body));
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });
}

const MultipartTextField = z.object({ type: z.literal('field'), value: z.string() }).transform((field) => field.value);

function readMultipartTextField(field: unknown): string | undefined {
  return MultipartTextField.safeParse(Array.isArray(field) ? field[0] : field).data;
}

// Maps a core error raised while serving documents into a {@link RouteHttpError} with a public message
// and status; non-document/owner errors propagate for the shared sender to handle (or surface as a 500).
async function mapHttpDocumentErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isDocumentCoreError(error)) {
      const mapped = mapDocumentCoreError(error);
      throw new RouteHttpError({
        appCode: mapped.appCode,
        message: mapped.message,
        statusCode: trpcCodeToHttpStatus(mapped.code),
      });
    }

    if (isProductCoreError(error)) {
      if (error.code === 'product.brochure_incomplete') {
        throw new RouteHttpError({
          appCode: error.code,
          message: 'This brochure is incomplete, so a preview is not available yet.',
          statusCode: 409,
        });
      }

      throw mapOwnerNotFound(error, { notFoundCode: 'product.not_found', label: 'Product', otherStatus: 400 });
    }

    if (isJobCoreError(error)) {
      // A cancelled Job is a terminal-state conflict, mapped to 400 like the tRPC boundary (and the
      // QuoteLockedError precedent) so the same appCode carries the same status on every surface.
      if (error.code === 'job.cancelled') {
        throw new RouteHttpError({ appCode: error.code, message: error.message, statusCode: 400 });
      }

      throw mapOwnerNotFound(error, { notFoundCode: 'job.not_found', label: 'Job', otherStatus: 403 });
    }

    if (isQuoteCoreError(error)) {
      throw mapOwnerNotFound(error, { notFoundCode: 'quote.not_found', label: 'Quote', otherStatus: 400 });
    }

    throw error;
  }
}

// Owner reads share one shape: the owner's not-found code becomes a 404 with a public label, and every
// other owner error keeps its message at the owner's fallback status.
function mapOwnerNotFound(
  error: { code: string; message: string },
  { label, notFoundCode, otherStatus }: { label: string; notFoundCode: string; otherStatus: number },
): RouteHttpError {
  const notFound = error.code === notFoundCode;

  return new RouteHttpError({
    appCode: error.code,
    message: notFound ? `${label} not found.` : error.message,
    statusCode: notFound ? 404 : otherStatus,
  });
}

function sendDocumentHttpError(reply: FastifyReply, error: unknown): void {
  sendHttpError(reply, error, {
    fallbackMessage: 'Document request failed.',
    invalidRequestMessage: 'Invalid document request.',
    onFileTooLarge: () => {
      const result = validateDocumentPolicy({
        byteSize: Number.MAX_SAFE_INTEGER,
        contentType: 'application/pdf',
        ownerType: 'product',
      });

      return {
        appCode: result.ok ? undefined : result.code,
        message: result.ok ? 'Document is too large.' : result.message,
      };
    },
  });
}

function trpcCodeToHttpStatus(code: string): number {
  if (code === 'BAD_REQUEST') return 400;
  if (code === 'CONFLICT') return 409;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'NOT_FOUND') return 404;

  return 500;
}

function createContentDisposition(filename: string, disposition: 'attachment' | 'inline' = 'attachment'): string {
  const fallback = filename.replace(/["\\\r\n]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/'/g, '%27');

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
