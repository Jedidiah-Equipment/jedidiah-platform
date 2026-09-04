import { isPartCoreError, renderPartLabel, renderPartLabelBatch } from '@pkg/core/equipment';
import { db } from '@pkg/db';
import { renderPartLabelsPdf } from '@pkg/pdf/equipment';
import { UUID } from '@pkg/schema';
import {
  PartLabelBatchQuery,
  PartLabelBatchSelection,
  type PartLabelBatchSelection as PartLabelBatchSelectionInput,
  type PartLabelPdfRenderer,
} from '@pkg/schema/equipment';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  createContentDisposition,
  RouteHttpError,
  requireAnyPermission,
  requireRouteAuth,
  sendHttpError,
} from '@/routes/http-route-helpers.js';

const PartLabelParams = z.object({ partId: UUID });

export async function registerPartLabelHttpRoutes(
  app: FastifyInstance,
  { pdfRenderer = renderPartLabelsPdf }: { pdfRenderer?: PartLabelPdfRenderer } = {},
): Promise<void> {
  const sendPartLabelBatch = async (
    request: FastifyRequest,
    reply: FastifyReply,
    readSelection: () => PartLabelBatchSelectionInput,
  ) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePartLabelAccess(auth);
      const selection = readSelection();
      const result = await mapPartLabelErrors(() => renderPartLabelBatch({ db, pdfRenderer, selection }));
      return sendPdf(reply, result);
    } catch (error) {
      sendPartLabelHttpError(reply, error);
    }
  };

  app.get('/api/parts/labels', async (request, reply) => {
    return sendPartLabelBatch(request, reply, () => PartLabelBatchQuery.parse(request.query));
  });

  app.post('/api/parts/labels', async (request, reply) => {
    return sendPartLabelBatch(request, reply, () => PartLabelBatchSelection.parse(request.body));
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

/**
 * A label carries a Part's own identity — code, name, location — and no cost, so the physical roles
 * print it as readily as the catalog ones. Spec §10 puts a print button on receiving lines, which
 * the price-blind `stores` role works: it holds `equipment_inventory:read` but no `equipment_part:read` (§11's matrix).
 */
function requirePartLabelAccess(auth: Parameters<typeof requireAnyPermission>[0]): void {
  requireAnyPermission(
    auth,
    ['equipment_part:read', 'equipment_inventory:read'],
    'You do not have permission to print Part labels.',
    'part.label_forbidden',
  );
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
