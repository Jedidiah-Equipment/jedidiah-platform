import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { createOpenAiChatModel } from '@pkg/ai';
import {
  createScribeModel,
  deriveTranscriptionHint,
  readMeterPhoto,
  tidyTranscript,
  transcribeVoiceNote,
} from '@pkg/ai/contracting';
import type { StorageAdapter } from '@pkg/core';
import {
  createKeytermCache,
  deriveHintFor,
  listReadingsAwaitingVerification,
  listTranscriptionsAwaitingHints,
  loadKeyterms,
  type TranscriptionEngine,
  verifyCapturedReading,
} from '@pkg/core/contracting';
import { sweepJobCompletions } from '@pkg/core/equipment';
import { db } from '@pkg/db';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain/equipment';
import { renderJobCardPdf } from '@pkg/pdf/contracting';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { type Auth, auth as appAuth } from './app-auth.js';
import { registerAuthHandler } from './auth/handler.js';
import { BackgroundQueue } from './background-queue.js';
import { ReadingVerificationQueue } from './contracting/readings/reading-verification-queue.js';
import { type ApiConfig, getApiConfig } from './env.js';
import { createCatalogTranslationRunner } from './equipment/catalog-translations/catalog-translation-runner.js';
import { TranslationScheduler } from './equipment/catalog-translations/translation-scheduler.js';
import { JobCompletionSweeper } from './equipment/jobs/job-completion-sweeper.js';
import { registerHealthRoutes } from './health.js';
import { log } from './logger.js';
import { createObservability, type Observability } from './observability.js';
import { createFileChangelogLoader } from './routes/changelog/changelog-loader.js';
import { registerJobCardHttpRoutes } from './routes/contracting/jobs/job-card-http.route.js';
import { registerReadingHttpRoutes } from './routes/contracting/readings/readings-http.route.js';
import { registerTranscriptionHttpRoutes } from './routes/contracting/transcriptions/transcriptions-http.route.js';
import { registerAiChatRoute } from './routes/equipment/ai/ai-chat.route.js';
import { registerDocumentHttpRoutes } from './routes/equipment/documents/document-http.route.js';
import { registerEntityFileRoutes } from './routes/equipment/files/entity-file-http.route.js';
import { registerPartLabelHttpRoutes } from './routes/equipment/parts/part-label-http.route.js';
import {
  createProductRangeImageRouteConfig,
  createProductRangeLogoRouteConfig,
} from './routes/equipment/product-ranges/product-range-image-routes.js';
import { createProductImageRouteConfig } from './routes/equipment/products/product-image-routes.js';
import { registerUserBadgeHttpRoutes } from './routes/equipment/users/user-badge-http.route.js';
import { createDocumentStorageAdapter } from './storage/s3-storage-adapter.js';
import { createContextFactory } from './trpc/context.js';
import { serializeError, shouldLogTRPCError } from './trpc/errors.js';
import { type AppRouter, createAppRouter } from './trpc/router.js';

export async function buildServer(
  config: ApiConfig = getApiConfig(),
  observability: Observability = createObservability(config),
  storage: StorageAdapter = createDocumentStorageAdapter(config),
  auth: Auth = appAuth,
) {
  log.root.info({ config }, 'Building server');
  const catalogTranslationScheduler = new TranslationScheduler({
    onError: (error, key) => log.ai.error({ error, key }, 'Catalog translation failed'),
    run: createCatalogTranslationRunner({
      db,
      model: createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_TRANSLATION_MODEL }),
    }),
  });

  const jobCompletionSweeper = new JobCompletionSweeper({
    onError: (error) => log.root.error({ error }, 'Job completion sweep failed'),
    run: async () => {
      const result = await sweepJobCompletions({ db });

      if (result.completed > 0) {
        log.root.info(result, 'Job completion sweep stamped Jobs');
      }
    },
  });

  const app = Fastify({
    loggerInstance: log.http as FastifyBaseLogger,
    routerOptions: {
      // tRPC GET batches encode procedure names in one route param; the quotes page exceeds Fastify's 100-char default.
      maxParamLength: 1000,
    },
  });

  // Only the Lander belongs in search results. Google already crawls this host — it reports the 404 at `/`
  // — and `/health` answers 200 to anyone, so a directive has to cover every response rather than the routes
  // we happen to think of. There is no HTML shell to carry a `<meta name="robots">` here, which makes the
  // header the only mechanism available.
  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Robots-Tag', 'noindex, nofollow');
  });

  await app.register(fastifyCors, {
    origin: config.AUTH_TRUSTED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-POSTHOG-DISTINCT-ID',
      'X-POSTHOG-SESSION-ID',
    ],
    maxAge: 86400,
  });

  await registerAuthHandler(app, auth);
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: PRODUCT_DOCUMENT_MAX_BYTES,
    },
  });
  const openAiModel = createOpenAiChatModel({ apiKey: config.OPENAI_API_KEY, model: config.OPENAI_MODEL });
  const meterReader = (input: { bytes: Uint8Array; contentType: string }) =>
    readMeterPhoto({ ...input, model: openAiModel });
  const readingVerifications = new ReadingVerificationQueue({
    run: (id) => verifyCapturedReading({ db, id, storage, readPhoto: meterReader }),
    onError: (error, readingId) => log.ai.error({ error, readingId }, 'Reading verification failed'),
  });
  await registerReadingHttpRoutes(app, { db, storage, verifications: readingVerifications });
  const scribe = config.ELEVENLABS_API_KEY
    ? createScribeModel({ apiKey: config.ELEVENLABS_API_KEY, model: config.ELEVENLABS_TRANSCRIPTION_MODEL })
    : null;
  if (!scribe) log.ai.warn('ELEVENLABS_API_KEY is unset: voice notes disabled');
  const transcriptionEngine: TranscriptionEngine | null = scribe && {
    transcribe: (input) => transcribeVoiceNote({ ...input, model: scribe }),
    tidy: (input) => tidyTranscript({ ...input, model: openAiModel }),
    derive: (input) => deriveTranscriptionHint({ ...input, model: openAiModel }),
  };
  const keyterms = createKeytermCache(() => loadKeyterms({ db }));
  const hintDerivations = new BackgroundQueue<string>({
    run: async (id) => {
      if (!transcriptionEngine) return;
      const outcome = await deriveHintFor({ db, id, engine: transcriptionEngine });
      // A new hint keyterm should reach the next note, not the next cache refresh.
      if (outcome?.action === 'add') keyterms.invalidate();
    },
    onError: (error, transcriptionId) => log.ai.error({ error, transcriptionId }, 'Hint derivation failed'),
    concurrency: 1,
  });
  await registerTranscriptionHttpRoutes(app, { db, engine: transcriptionEngine, keyterms: keyterms.current });
  await registerJobCardHttpRoutes(app, { db, pdfRenderer: renderJobCardPdf });
  await registerAiChatRoute(app, { storage });
  await registerDocumentHttpRoutes(app, storage);
  await registerPartLabelHttpRoutes(app);
  await registerUserBadgeHttpRoutes(app);
  await registerEntityFileRoutes(app, [
    createProductImageRouteConfig(storage, { cacheDir: config.API_IMAGE_CACHE_DIR }),
    createProductRangeImageRouteConfig(storage),
    createProductRangeLogoRouteConfig(storage),
  ]);
  await registerHealthRoutes(app, config);

  const trpcOptions = {
    router: createAppRouter({ catalogTranslationScheduler, hintDerivations, readMeterPhoto: meterReader }),
    createContext: createContextFactory({
      appEnv: config.APP_ENV,
      changelogLoader: createFileChangelogLoader(),
      storage,
    }),
    onError({ ctx, error, path, type }) {
      if (!shouldLogTRPCError(error)) return;

      log.root.error({ error: serializeError(error), path, type }, 'Unexpected tRPC error');
      observability.captureException(error, {
        properties: { ...ctx?.mobileObservability, path, type, source: 'trpc' },
      });
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'];

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions,
  });

  app.addHook('onClose', async () => {
    catalogTranslationScheduler.dispose();
    await readingVerifications.dispose();
    await hintDerivations.dispose();
    jobCompletionSweeper.dispose();
    await observability.flush();
  });

  jobCompletionSweeper.start();
  readingVerifications
    .resume(() => listReadingsAwaitingVerification({ db }))
    .catch((error: unknown) => log.ai.error({ error }, 'Resuming reading verifications failed'));
  if (transcriptionEngine)
    hintDerivations
      .resume(() => listTranscriptionsAwaitingHints({ db }))
      .catch((error: unknown) => log.ai.error({ error }, 'Resuming hint derivations failed'));

  return app;
}
