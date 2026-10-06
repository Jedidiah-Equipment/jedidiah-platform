import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import type { StorageAdapter } from '@pkg/core';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain/equipment';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger } from 'fastify';
import { type Auth, auth as appAuth } from './app-auth.js';
import { registerAuthHandler } from './auth/handler.js';
import { registerContracting } from './contracting/wiring.js';
import { type ApiConfig, getApiConfig } from './env.js';
import { registerEquipment } from './equipment/wiring.js';
import { registerHealthRoutes } from './health.js';
import { log } from './logger.js';
import { createObservability, type Observability } from './observability.js';
import { createFileChangelogLoader } from './routes/changelog/changelog-loader.js';
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

  const equipment = await registerEquipment(app, { config, storage });
  const contracting = await registerContracting(app, { config, storage });
  await registerHealthRoutes(app, config);

  const trpcOptions = {
    router: createAppRouter({
      contracting: contracting.routerDependencies,
      equipment: equipment.routerDependencies,
    }),
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

  const services = [...equipment.services, ...contracting.services];

  app.addHook('onClose', async () => {
    for (const service of services) await service.dispose();
    await observability.flush();
  });

  for (const service of services) service.start?.();

  return app;
}
