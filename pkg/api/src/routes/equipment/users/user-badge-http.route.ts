import { renderUserBadge } from '@pkg/core/equipment';
import type { Db } from '@pkg/db';
import { renderUserBadgesPdf } from '@pkg/pdf/equipment';
import { AuthId } from '@pkg/schema';
import type { UserBadgePdfRenderer } from '@pkg/schema/equipment';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import {
  createContentDisposition,
  mapCoreErrorToRoute,
  requirePermission,
  requireRouteAuth,
  sendHttpError,
} from '@/routes/http-route-helpers.js';
import { userErrorFamily } from '@/routes/shared-error-families.js';
import { userDeviceErrorFamily } from '../equipment-error-families.js';

const UserBadgeParams = z.object({ userId: AuthId });

/**
 * Printing a Badge Card, served as a PDF rather than through tRPC for the same reason the Part labels
 * are: the browser opens it straight into the print dialog.
 *
 * Gated on `user:set-role` rather than a printing right of its own. The card names a person to the
 * Quick-switch, and who may be named there follows from who holds a role at all — handing out badges
 * is that same decision in physical form, so it should not be separately grantable.
 */
export async function registerUserBadgeHttpRoutes(
  app: FastifyInstance,
  { db, pdfRenderer = renderUserBadgesPdf }: { db: Db; pdfRenderer?: UserBadgePdfRenderer },
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
      const result = await renderUserBadge({ db, pdfRenderer, userId });

      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', result.bytes.byteLength);
      reply.header('Content-Disposition', createContentDisposition(result.filename, 'inline'));
      return reply.send(Buffer.from(result.bytes));
    } catch (error) {
      sendUserBadgeHttpError(reply, error);
    }
  });
}

function sendUserBadgeHttpError(reply: FastifyReply, error: unknown): void {
  sendHttpError(reply, mapCoreErrorToRoute(error, userErrorFamily, userDeviceErrorFamily), {
    fallbackMessage: 'Stores badge request failed.',
    invalidRequestMessage: 'Invalid stores badge request.',
  });
}
