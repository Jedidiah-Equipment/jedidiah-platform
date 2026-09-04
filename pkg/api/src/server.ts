import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import { createOpenAiChatModel } from '@pkg/ai';
import type { StorageAdapter } from '@pkg/core';
import { sweepJobCompletions } from '@pkg/core/equipment';
import { db } from '@pkg/db';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain/equipment';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger } from 'fastify';

import { type Auth, auth as appAuth } from './app-auth.js';
import { registerAuthHandler } from './auth/handler.js';
import { type ApiConfig, getApiConfig } from './env.js';
import { createCatalogTranslationRunner } from './equipment/catalog-translations/catalog-translation-runner.js';
import { TranslationScheduler } from './equipment/catalog-translations/translation-scheduler.js';
import { JobCompletionSweeper } from './equipment/jobs/job-completion-sweeper.js';
import { registerHealthRoutes } from './health.js';
import { log } from './logger.js';
import { createObservability, type Observability } from './observability.js';
import { createFileChangelogLoader } from './routes/changelog/changelog-loader.js';
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  });

  await registerAuthHandler(app, auth);
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: PRODUCT_DOCUMENT_MAX_BYTES,
    },
  });
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
    router: createAppRouter({ catalogTranslationScheduler }),
    createContext: createContextFactory({
      appEnv: config.APP_ENV,
      changelogLoader: createFileChangelogLoader(),
      storage,
    }),
    onError({ error, path, type }) {
      if (!shouldLogTRPCError(error)) return;

      log.root.error({ error: serializeError(error), path, type }, 'Unexpected tRPC error');
      observability.captureException(error, { properties: { path, type, source: 'trpc' } });
    },
  } satisfies FastifyTRPCPluginOptions<AppRouter>['trpcOptions'];

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions,
  });

  app.addHook('onClose', async () => {
    catalogTranslationScheduler.dispose();
    jobCompletionSweeper.dispose();
    await observability.flush();
  });

  jobCompletionSweeper.start();

  return app;
}
