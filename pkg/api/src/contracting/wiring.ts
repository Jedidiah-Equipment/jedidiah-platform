import { createOpenAiChatModel } from '@pkg/ai';
import { readMeterPhoto as readMeterPhotoWithModel } from '@pkg/ai/contracting';
import {
  dispatchContractingPush,
  listReadingsAwaitingVerification,
  type ReadMeterPhoto,
  verifyCapturedReading,
} from '@pkg/core/contracting';
import type { ContractingPushEvent } from '@pkg/domain/contracting';
import {
  JohnDeereClient,
  JohnDeereConnectionService,
  JohnDeereLinkService,
  JohnDeerePoller,
} from '@pkg/integrations/contracting';
import { renderJobCardPdf } from '@pkg/pdf/contracting';
import type { FastifyInstance } from 'fastify';
import { BackgroundQueue } from '../background-queue.js';
import type { BusinessWiring, BusinessWiringInput } from '../business-wiring.js';
import type { ApiConfig } from '../env.js';
import { log } from '../logger.js';
import { registerBreakdownHttpRoutes } from '../routes/contracting/breakdowns/breakdowns-http.route.js';
import type { ContractingPushScheduler } from '../routes/contracting/contracting-push-scheduler.js';
import { registerJobCardHttpRoutes } from '../routes/contracting/jobs/job-card-http.route.js';
import type { JohnDeereDependencies } from '../routes/contracting/john-deere/john-deere.router.js';
import {
  johnDeereCallbackUris,
  registerJohnDeereHttpRoutes,
} from '../routes/contracting/john-deere/john-deere-http.route.js';
import { registerReadingHttpRoutes } from '../routes/contracting/readings/readings-http.route.js';
import { serializeError } from '../trpc/errors.js';

export type ContractingRouterDependencies = {
  johnDeere: JohnDeereDependencies | null;
  push: ContractingPushScheduler;
  readMeterPhoto: ReadMeterPhoto;
};

/** The John Deere Connection, Links and hourly poller, or null when this environment holds no John Deere keys. */
function createJohnDeere(
  config: ApiConfig,
  db: BusinessWiringInput['db'],
  push: ContractingPushScheduler,
): JohnDeereDependencies | null {
  const { JOHN_DEERE_CLIENT_ID: clientId, JOHN_DEERE_CLIENT_SECRET: clientSecret, JOHN_DEERE_TOKEN_KEY } = config;
  if (!clientId || !clientSecret || !JOHN_DEERE_TOKEN_KEY) return null;
  const now = () => new Date();
  const client = new JohnDeereClient({
    platformBaseUrl: config.JOHN_DEERE_API_BASE_URL,
    equipmentBaseUrl: config.JOHN_DEERE_EQUIPMENT_API_BASE_URL,
    issuer: config.JOHN_DEERE_ISSUER,
    clientId,
    clientSecret,
    fetch: globalThis.fetch,
    now,
  });
  const connection = new JohnDeereConnectionService({
    db,
    client,
    tokenKey: Buffer.from(JOHN_DEERE_TOKEN_KEY, 'base64'),
    ...johnDeereCallbackUris(config.API_BASE_URL),
    now,
  });
  const links = new JohnDeereLinkService({ db, client, connection, now });
  const poller = new JohnDeerePoller({
    db,
    client,
    connection,
    links,
    push,
    logger: log.service,
    now,
    intervalMs: config.JOHN_DEERE_POLL_INTERVAL_MS,
  });
  return { connection, links, poller };
}

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
  const johnDeere = createJohnDeere(config, db, contractingPush);
  if (johnDeere)
    await registerJohnDeereHttpRoutes(app, {
      connection: johnDeere.connection,
      appBaseUrl: config.APP_BASE_URL,
      secureCookie: config.API_BASE_URL.startsWith('https:'),
    });

  return {
    routerDependencies: { johnDeere, push: contractingPush, readMeterPhoto },
    // The poller goes before the push queue it schedules into, so a run finishing at shutdown still delivers.
    services: [readingVerifications, ...(johnDeere ? [johnDeere.poller] : []), contractingPush],
  };
}
