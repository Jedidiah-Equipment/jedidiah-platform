import { captureReading } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { READING_CAPTURE_PATH } from '@pkg/domain/contracting';
import { ReadingCaptureInput } from '@pkg/schema/contracting';
import type { FastifyInstance } from 'fastify';
import { mapCoreErrorToRoute, requirePermission, requireRouteAuth, sendHttpError } from '../../http-route-helpers.js';
import { readingErrorFamily } from '../contracting-error-families.js';
import { type ContractingPushScheduler, scheduleServiceDueSoon } from '../contracting-push-scheduler.js';

export async function registerReadingHttpRoutes(
  app: FastifyInstance,
  { db, push }: { db: Db; push: ContractingPushScheduler },
) {
  app.post(READING_CAPTURE_PATH, async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      requirePermission(auth, 'contracting_reading:capture', 'You cannot capture Hour Readings.', 'reading.forbidden');
      const input = ReadingCaptureInput.parse(request.body);
      const { reading, serviceDueSoonCrossed } = await captureReading({ db, actor: auth.access, input });
      scheduleServiceDueSoon(push, { machineId: input.machineId, serviceDueSoonCrossed });
      return reply.status(201).send(reading);
    } catch (error) {
      return sendHttpError(reply, mapCoreErrorToRoute(error, readingErrorFamily), {
        fallbackMessage: 'Reading request failed.',
        invalidRequestMessage: 'Invalid Hour Reading.',
      });
    }
  });
}
