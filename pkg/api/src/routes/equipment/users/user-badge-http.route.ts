import { isUserCoreError, renderUserBadge } from '@pkg/core';
import { db } from '@pkg/db';
import { renderUserBadgesPdf } from '@pkg/pdf';
import { AuthId, type UserBadgePdfRenderer } from '@pkg/schema';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  createContentDisposition,
  RouteHttpError,
  requirePermission,
  requireRouteAuth,
  sendHttpError,
} from '../../http-route-helpers.js';

const UserBadgeParams = z.object({ userId: AuthId });

/**
 * Printing a stores badge card, served as a PDF rather than through tRPC for the same reason the
 * Part labels are: the browser opens it straight into the print dialog.
 *
 * Gated on `user:set-role` rather than a printing right of its own. The card names a person to the
 * quick-switch, and who may be named there follows from who may set someone's role to `stores` —
 * handing out badges is that same decision in physical form, so it should not be separately grantable.
 */
export async function registerUserBadgeHttpRoutes(
  app: FastifyInstance,
  { pdfRenderer = renderUserBadgesPdf }: { pdfRenderer?: UserBadgePdfRenderer } = {},
): Promise<void> {
  app.get('/api/users/:userId/badge', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      requirePermission(
        auth,
        'user:set-role',
        'You do not have permission to print stores badges.',
        'user.badge_forbidden',
      );
      const { userId } = UserBadgeParams.parse(request.params);
      const result = await mapUserBadgeErrors(() => renderUserBadge({ db, pdfRenderer, userId }));

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', result.bytes.byteLength);
      reply.header('Content-Disposition', createContentDisposition(result.filename, 'inline'));
      return reply.send(Buffer.from(result.bytes));
    } catch (error) {
      sendUserBadgeHttpError(reply, error);
    }
  });
}

async function mapUserBadgeErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (isUserCoreError(error)) {
      if (error.code === 'user.not_found') {
        throw new RouteHttpError({ appCode: error.code, message: 'User not found.', statusCode: 404 });
      }
      if (error.code === 'user.is_device') {
        throw new RouteHttpError({
          appCode: error.code,
          message: 'A shared device has no badge card.',
          statusCode: 400,
        });
      }
    }
    throw error;
  }
}

function sendUserBadgeHttpError(reply: FastifyReply, error: unknown): void {
  sendHttpError(reply, error, {
    fallbackMessage: 'Stores badge request failed.',
    invalidRequestMessage: 'Invalid stores badge request.',
  });
}
