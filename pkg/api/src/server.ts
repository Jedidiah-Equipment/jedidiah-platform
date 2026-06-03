import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import type { StorageAdapter } from '@pkg/core';
import { PRODUCT_DOCUMENT_MAX_BYTES } from '@pkg/domain';
import { type FastifyTRPCPluginOptions, fastifyTRPCPlugin } from '@trpc/server/adapters/fastify';
import Fastify, { type FastifyBaseLogger } from 'fastify';

import { registerAuthHandler } from './auth/handler.js';
import { type ApiConfig, getApiConfig } from './env.js';
import { registerHealthRoutes } from './health.js';
import { log } from './logger.js';
import { createObservability, type Observability } from './observability.js';
import { renderQuoteDocumentPdf } from './quote-documents/quote-document-pdf-renderer.js';
import { registerAiStreamRoute } from './routes/ai/ai-stream.route.js';
import { registerDocumentHttpRoutes } from './routes/documents/document-http.route.js';
import { createDocumentStorageAdapter } from './storage/s3-storage-adapter.js';
import { createContextFactory } from './trpc/context.js';
import { shouldLogTRPCError } from './trpc/errors.js';
import { appRouter } from './trpc/router.js';

export async function buildServer(
  config: ApiConfig = getApiConfig(),
  observability: Observability = createObservability(config),
  storage: StorageAdapter = createDocumentStorageAdapter(config),
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
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: PRODUCT_DOCUMENT_MAX_BYTES,
    },
  });
  await registerAiStreamRoute(app);
  await registerDocumentHttpRoutes(app, storage);
  await registerHealthRoutes(app, config);

  const trpcOptions = {
    router: appRouter,
    createContext: createContextFactory({
      quoteDocumentPdfRenderer: renderQuoteDocumentPdf,
      storage,
    }),
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
