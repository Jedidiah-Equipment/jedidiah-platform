import { AppEnv, type ClientConfig } from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

if (process.env.APP_ENV === 'development') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

export type ServerConfig = z.infer<typeof ServerConfig>;
export const ServerConfig = z
  .object({
    APP_ENV: AppEnv,
    PORT: z.coerce.number().int().positive().default(7001),
    APP_BASE_URL: z.url(),
    API_BASE_URL: z.url(),
    AUTH_BASE_URL: z.url(),
    RAILWAY_DEPLOYMENT_ID: z.string().min(1).optional(),
    RAILWAY_SNAPSHOT_ID: z.string().min(1).optional(),
    RAILWAY_SERVICE_NAME: z.string().min(1).optional(),
    RAILWAY_ENVIRONMENT_NAME: z.string().min(1).optional(),
    RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
  })
  .transform((env) => ({
    port: env.PORT,
    deployment: {
      appEnv: env.APP_ENV,
      serviceName: env.RAILWAY_SERVICE_NAME ?? null,
      environmentName: env.RAILWAY_ENVIRONMENT_NAME ?? null,
      deploymentId: env.RAILWAY_DEPLOYMENT_ID ?? null,
      snapshotId: env.RAILWAY_SNAPSHOT_ID ?? null,
      commitSha: env.RAILWAY_GIT_COMMIT_SHA ?? null,
    },
    clientConfig: {
      appEnv: env.APP_ENV,
      appBaseUrl: env.APP_BASE_URL,
      apiBaseUrl: env.API_BASE_URL,
      authBaseUrl: env.AUTH_BASE_URL,
    },
  }));

export type InjectedClientConfig = z.infer<typeof ClientConfig>;

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerConfig.parse(env);
}

export function getInjectedClientConfig(env: NodeJS.ProcessEnv = process.env): InjectedClientConfig {
  return getServerConfig(env).clientConfig;
}
