import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Observability } from '../../observability.js';
import { requireRouteAuth, sendHttpError } from '../http-route-helpers.js';

const MobileTelemetry = z.strictObject({
  event: z.literal('reading sync failed'),
  properties: z.strictObject({
    appVersion: z.string().max(40).nullable(),
    code: z.string().max(80).nullable(),
    hasPhoto: z.boolean(),
    platform: z.enum(['android', 'ios', 'web']),
    queueAgeSeconds: z.number().int().nonnegative(),
    role: z.enum(['arrival', 'departure', 'spot']),
    stage: z.enum(['prepare_photo', 'upload']),
    updateId: z.string().max(80).nullable(),
  }),
});

export async function registerMobileTelemetryRoute(app: FastifyInstance, observability: Observability) {
  app.post('/api/mobile/telemetry', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;

    try {
      const input = MobileTelemetry.parse(request.body);
      observability.captureEvent({
        distinctId: auth.session.user.id,
        event: input.event,
        properties: { app: 'mobile', ...input.properties },
      });
      return reply.status(204).send();
    } catch (error) {
      return sendHttpError(reply, error, {
        fallbackMessage: 'Mobile telemetry request failed.',
        invalidRequestMessage: 'Invalid mobile telemetry.',
      });
    }
  });
}
