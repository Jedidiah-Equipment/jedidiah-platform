import { createOpenAiChatModel, extractSupplierInvoice } from '@pkg/ai';
import {
  createJobPurchaseOrder,
  createProductDocument,
  isCreditNoteCoreError,
  isDocumentCoreError,
  isJobCoreError,
  isProductCoreError,
  isPurchaseOrderCoreError,
  isQuoteCoreError,
  readJobDocument,
  readProductDocument,
  readPurchaseOrderDocument,
  readQuoteDocument,
  renderProductBrochurePreview,
  renderPurchaseOrderPreview,
  type StorageAdapter,
  type SupplierInvoiceExtractor,
  uploadCreditNote,
  uploadSupplierInvoice,
} from '@pkg/core';
import { db } from '@pkg/db';
import { validateDocumentPolicy } from '@pkg/domain';
import { renderBrochurePdf, renderPurchaseOrderPdf } from '@pkg/pdf';
import {
  CreditNoteSettlementInput,
  DocumentListByProductInput,
  JobDocumentInput,
  ProductDocumentInput,
  PurchaseOrderActionInput,
  PurchaseOrderDocumentInput,
  QuoteDocumentInput,
} from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { getApiConfig } from '@/env.js';
import {
  createContentDisposition,
  RouteHttpError,
  requireAnyPermission,
  requirePermission,
  requireRouteAuth,
  sendUploadHttpError,
  streamObjectBody,
} from '../http-route-helpers.js';
import { mapDocumentCoreError } from './documents.router.js';

const JobDocumentUploadInput = JobDocumentInput.pick({ jobId: true });
const PurchaseOrderParams = z.object({ purchaseOrderId: PurchaseOrderActionInput.shape.id });

export type RegisterDocumentHttpRoutesOptions = {
  /** Overridden by tests; production reads the invoice with the configured OpenAI model. */
  extractSupplierInvoice?: SupplierInvoiceExtractor;
};

export async function registerDocumentHttpRoutes(
  app: FastifyInstance,
  storage: StorageAdapter,
  options: RegisterDocumentHttpRoutesOptions = {},
): Promise<void> {
  const extractInvoice: SupplierInvoiceExtractor =
    options.extractSupplierInvoice ??
    (({ bytes, contentType }) => {
      const config = getApiConfig();

      return extractSupplierInvoice({
        bytes,
        contentType,
        model: createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL }),
      });
    });

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

      if (result.document.ownerType === 'purchase_order') {
        requirePermission(
          auth,
          'inventory_cost:read',
          'You do not have permission to view Purchase Order prices.',
          'document.forbidden',
        );
      }

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

  app.get('/api/purchase-orders/:purchaseOrderId/preview', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'purchase_order:create',
        'You do not have permission to preview this Purchase Order.',
        'document.forbidden',
      );
      requirePermission(
        auth,
        'inventory_cost:read',
        'You do not have permission to preview Purchase Order prices.',
        'document.forbidden',
      );
      const params = PurchaseOrderParams.parse(request.params);
      const preview = await mapHttpDocumentErrors(() =>
        renderPurchaseOrderPreview({ db, id: params.purchaseOrderId, pdfRenderer: renderPurchaseOrderPdf }),
      );

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', preview.bytes.byteLength);
      reply.header('Content-Disposition', createContentDisposition(preview.filename, 'inline'));
      return reply.send(Buffer.from(preview.bytes));
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  /**
   * Files a supplier credit against an order, naming the `return-to-supplier` movements it settles
   * (spec §4). Gated on `purchase_order:amend` alone — the same procurement hands that make the call
   * the credit answers. No separate cost gate: reading the priced document back already needs one on
   * the download route, and adding a second here would narrow who may file past what the spec asks.
   */
  app.post('/api/purchase-orders/:purchaseOrderId/credit-notes', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'purchase_order:amend',
        'You do not have permission to file credit notes.',
        'document.forbidden',
      );
      const params = PurchaseOrderParams.parse(request.params);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: 'Choose a credit note to upload.' });
        return;
      }

      const bytes = await file.toBuffer();
      const input = CreditNoteSettlementInput.parse({
        purchaseOrderId: params.purchaseOrderId,
        stockMovementIds: readMultipartJsonField(file.fields.stockMovementIds),
      });
      const document = await mapHttpCreditNoteErrors(() =>
        uploadCreditNote({
          actorUserId: auth.session.user.id,
          bytes,
          db,
          filename: file.filename,
          input,
          storage,
        }),
      );

      reply.status(201).send(document);
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  /**
   * Files the Supplier's bill against an order and records what an AI read off it (spec §5).
   *
   * Gated on `purchase_order:amend` alone, exactly like the credit note: filing the paperwork is
   * procurement's job. Reading the cross-check it feeds is a separate, narrower question the tRPC
   * panel answers under the cost gate — and the priced document itself is already gated on the
   * download route, so a second gate here would only narrow who may file.
   */
  app.post('/api/purchase-orders/:purchaseOrderId/supplier-invoices', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'purchase_order:amend',
        'You do not have permission to file Supplier invoices.',
        'document.forbidden',
      );
      const params = PurchaseOrderParams.parse(request.params);
      const file = await request.file();

      if (!file) {
        reply.status(400).send({ message: 'Choose a Supplier invoice to upload.' });
        return;
      }

      const bytes = await file.toBuffer();
      const document = await mapHttpDocumentErrors(() =>
        uploadSupplierInvoice({
          actorUserId: auth.session.user.id,
          bytes,
          contentType: file.mimetype,
          db,
          extract: extractInvoice,
          filename: file.filename,
          input: { purchaseOrderId: params.purchaseOrderId },
          storage,
        }),
      );

      reply.status(201).send(document);
    } catch (error) {
      sendDocumentHttpError(reply, error);
    }
  });

  app.get('/api/purchase-orders/:purchaseOrderId/documents/:documentId/download', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'purchase_order:read',
        'You do not have permission to download this Purchase Order.',
        'document.forbidden',
      );
      requirePermission(
        auth,
        'inventory_cost:read',
        'You do not have permission to view Purchase Order prices.',
        'document.forbidden',
      );
      const params = PurchaseOrderDocumentInput.parse(request.params);
      const result = await mapHttpDocumentErrors(() =>
        readPurchaseOrderDocument({
          db,
          documentId: params.documentId,
          purchaseOrderId: params.purchaseOrderId,
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

/**
 * A multipart field carrying a JSON array — the only way a list rides alongside a file upload. The
 * value is left unparsed on bad JSON so the input schema, not this helper, owns the message.
 */
function readMultipartJsonField(field: unknown): unknown {
  const value = readMultipartTextField(field);
  if (value === undefined) return undefined;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
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

    if (isPurchaseOrderCoreError(error)) {
      throw mapOwnerNotFound(error, {
        notFoundCode: 'purchase_order.not_found',
        label: 'Purchase Order',
        otherStatus: 400,
      });
    }

    throw error;
  }
}

/** A credit note also fails on the returns it claims, which the document families know nothing of. */
async function mapHttpCreditNoteErrors<T>(action: () => Promise<T>): Promise<T> {
  return mapHttpDocumentErrors(async () => {
    try {
      return await action();
    } catch (error) {
      if (isCreditNoteCoreError(error)) {
        throw new RouteHttpError({
          appCode: error.code,
          message: error.message,
          statusCode: error.code === 'credit_note.return_not_found' ? 404 : 409,
        });
      }

      throw error;
    }
  });
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
  sendUploadHttpError(reply, error, {
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
