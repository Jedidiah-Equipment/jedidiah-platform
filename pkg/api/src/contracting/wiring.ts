import { createOpenAiChatModel } from '@pkg/ai';
import { readMeterPhoto as readMeterPhotoWithModel } from '@pkg/ai/contracting';
import {
  dispatchContractingPush,
  listReadingsAwaitingVerification,
  type ReadMeterPhoto,
  verifyCapturedReading,
} from '@pkg/core/contracting';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import { renderJobCardPdf } from '@pkg/pdf/contracting';
import type { FastifyInstance } from 'fastify';
import { BackgroundQueue } from '../background-queue.js';
import type { BusinessWiring, BusinessWiringInput } from '../business-wiring.js';
import { log } from '../logger.js';
import { registerBreakdownHttpRoutes } from '../routes/contracting/breakdowns/breakdowns-http.route.js';
import type { ContractingPushScheduler } from '../routes/contracting/contracting-push-scheduler.js';
import { registerJobCardHttpRoutes } from '../routes/contracting/jobs/job-card-http.route.js';
import { registerReadingHttpRoutes } from '../routes/contracting/readings/readings-http.route.js';
import { serializeError } from '../trpc/errors.js';

export type ContractingRouterDependencies = {
  push: ContractingPushScheduler;
  readMeterPhoto: ReadMeterPhoto;
};

export async function registerContracting(
  app: FastifyInstance,
  { config, db, storage, push }: BusinessWiringInput,
): Promise<BusinessWiring<ContractingRouterDependencies>> {
  const chatModel = createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
  const readMeterPhoto: ReadMeterPhoto = (input) => readMeterPhotoWithModel({ ...input, model: chatModel });

  const readingVerifications = new BackgroundQueue<string>({
    run: (id) => verifyCapturedReading({ db, id, storage, readPhoto: readMeterPhoto }),
    onError: (error, readingId) => log.ai.error({ error, readingId }, 'Reading verification failed'),
    resume: {
      awaiting: () => listReadingsAwaitingVerification({ db }),
      onError: (error) => log.ai.error({ error }, 'Resuming reading verifications failed'),
    },
  });

  // Fire-and-forget after commit by decision: no `resume`, so a restart drops what was still queued.
  const contractingPush = new BackgroundQueue<ContractingPushEvent>({
    run: async (event) => {
      const delivery = await dispatchContractingPush({ db, event, sender: push });
      if (delivery.failed > 0) log.push.warn({ event, ...delivery }, 'Contracting push partly failed');
      else log.push.info({ event, ...delivery }, 'Contracting push delivered');
    },
    onError: (error, event) => log.push.error({ error: serializeError(error), event }, 'Contracting push failed'),
    concurrency: 1,
  });

  await registerReadingHttpRoutes(app, { db, storage, verifications: readingVerifications, push: contractingPush });
  await registerBreakdownHttpRoutes(app, { db, storage, push: contractingPush });
  await registerJobCardHttpRoutes(app, { db, pdfRenderer: renderJobCardPdf });

  return {
    routerDependencies: { push: contractingPush, readMeterPhoto },
    services: [readingVerifications, contractingPush],
  };
}
