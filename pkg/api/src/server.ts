import fastifyCors from "@fastify/cors";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import Fastify, { type FastifyBaseLogger } from "fastify";

import { registerAuthHandler } from "./auth/handler.js";
import { type ApiConfig, getApiConfig } from "./env.js";
import { registerHealthRoutes } from "./health.js";
import { getLoggerOptions } from "./logger.js";
import { registerAiStreamRoute } from "./routes/ai/ai-stream.route.js";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

export async function buildServer(config: ApiConfig = getApiConfig()) {
  const logger: FastifyBaseLogger = getLoggerOptions(config);
  const app = Fastify({
    loggerInstance: logger,
  });

  await app.register(fastifyCors, {
    origin: config.AUTH_TRUSTED_ORIGINS,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    maxAge: 86400,
  });

  await registerAuthHandler(app);
  await registerAiStreamRoute(app);
  await registerHealthRoutes(app);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext,
    },
  });

  return app;
}
