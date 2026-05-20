import fastifyCors from '@fastify/cors';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger } from 'fastify';

import { registerAuthHandler } from './auth/handler.js';
import { type ApiConfig, getApiConfig } from './env.js';
import { registerHealthRoutes } from './health.js';
import { log } from './logger.js';
import { createObservability, type Observability } from './observability.js';
import { registerAiStreamRoute } from './routes/ai/ai-stream.route.js';
import { createContext } from './trpc/context.js';
import { shouldLogTRPCError } from './trpc/errors.js';
import { appRouter } from './trpc/router.js';

export async function buildServer(
  config: ApiConfig = getApiConfig(),
  observability: Observability = createObservability(config),
) {
  log.root.info({ config }, 'Building server');

  const app = Fastify({
    loggerInstance: log.http as FastifyBaseLogger,
  });

  await app.register(fastifyCors, {
    origin: config.AUTH_TRUSTED_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400,
  });

  await registerAuthHandler(app);
  await registerAiStreamRoute(app);
  await registerHealthRoutes(app, config);

  const trpcOptions = {
    router: appRouter,
    createContext,
    onError({ error, path, type }) {
      if (!shouldLogTRPCError(error)) return;

      log.root.error({ error, path, type }, 'Unexpected tRPC error');
      observability.captureException(error, { properties: { path, type, source: 'trpc' } });
    },
  } satisfies FastifyTRPCPluginOptions<typeof appRouter>['trpcOptions'];

  await app.register(fastifyTRPCPlugin, {
    prefix: '/trpc',
    trpcOptions,
  });

  app.addHook('onClose', async () => {
    await observability.flush();
  });

  return app;
}
