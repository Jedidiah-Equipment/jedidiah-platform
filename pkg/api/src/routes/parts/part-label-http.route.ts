import { isPartCoreError, renderPartLabel, renderPartLabelBatch } from '@pkg/core';
import { db } from '@pkg/db';
import { renderPartLabelsPdf } from '@pkg/pdf';
import { PartLabelBatchQuery, type PartLabelPdfRenderer, UUID } from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  createContentDisposition,
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendHttpError,
} from '../http-route-helpers.js';

const PartLabelParams = z.object({ partId: UUID });

export async function registerPartLabelHttpRoutes(
  app: FastifyInstance,
  { pdfRenderer = renderPartLabelsPdf }: { pdfRenderer?: PartLabelPdfRenderer } = {},
): Promise<void> {
  app.get('/api/parts/labels', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePartLabelAccess(auth);
      const selection = PartLabelBatchQuery.parse(request.query);
      const result = await mapPartLabelErrors(() => renderPartLabelBatch({ db, pdfRenderer, selection }));
      return sendPdf(reply, result);
    } catch (error) {
      sendPartLabelHttpError(reply, error);
    }
  });

  app.get('/api/parts/:partId/label', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePartLabelAccess(auth);
      const { partId } = PartLabelParams.parse(request.params);
      const result = await mapPartLabelErrors(() => renderPartLabel({ db, id: partId, pdfRenderer }));
      return sendPdf(reply, result);
    } catch (error) {
      sendPartLabelHttpError(reply, error);
    }
  });
}

function requirePartLabelAccess(auth: Parameters<typeof requirePermission>[0]): void {
  requirePermission(auth, 'part:read', 'You do not have permission to print Part labels.', 'part.label_forbidden');
}

async function mapPartLabelErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isPartCoreError(error)) {
      if (error.code === 'part.not_found') {
        throw new RouteHttpError({ appCode: error.code, message: 'Part not found.', statusCode: 404 });
      }
      if (error.code === 'part.label_selection_empty') {
        throw new RouteHttpError({
          appCode: error.code,
          message: 'No Parts match this label selection.',
          statusCode: 404,
        });
      }
    }
    throw error;
  }
}

function sendPdf(reply: FastifyReply, result: { bytes: Uint8Array; filename: string }) {
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Length', result.bytes.byteLength);
  reply.header('Content-Disposition', createContentDisposition(result.filename, 'inline'));
  return reply.send(Buffer.from(result.bytes));
}

function sendPartLabelHttpError(reply: FastifyReply, error: unknown): void {
  sendHttpError(reply, error, {
    fallbackMessage: 'Part label request failed.',
    invalidRequestMessage: 'Invalid Part label request.',
  });
}
