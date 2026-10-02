import { renderJobCard } from '@pkg/core/contracting';
import type { Db } from '@pkg/db';
import { type JobCardPdfRenderer, JobCardQuery, JobNumber } from '@pkg/schema/contracting';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createContentDisposition,
  mapCoreErrorToRoute,
  requireRouteAuth,
  sendHttpError,
} from '../../http-route-helpers.js';
import { jobErrorFamily } from '../contracting-error-families.js';

const JobCardParams = z.object({ code: JobNumber });

export async function registerJobCardHttpRoutes(
  app: FastifyInstance,
  { db, pdfRenderer }: { db: Db; pdfRenderer: JobCardPdfRenderer },
) {
  app.get('/api/contracting/jobs/:code/job-card', async (request, reply) => {
    const auth = await requireRouteAuth(request, reply);
    if (!auth) return;
    try {
      const { code } = JobCardParams.parse(request.params);
      const { variant } = JobCardQuery.parse(request.query);
      const result = await renderJobCard({
        db,
        actor: auth.access,
        code,
        variant,
        pdfRenderer,
      });
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Length', result.bytes.byteLength);
      reply.header('Content-Disposition', createContentDisposition(result.filename, 'inline'));
      // Regenerated on every open: a Completed Job's figures still move.
      reply.header('Cache-Control', 'private, no-store');
      return reply.send(Buffer.from(result.bytes));
    } catch (error) {
      sendHttpError(reply, mapCoreErrorToRoute(error, jobErrorFamily), {
        fallbackMessage: 'Job Card request failed.',
        invalidRequestMessage: 'Invalid Job Card request.',
      });
    }
  });
}
