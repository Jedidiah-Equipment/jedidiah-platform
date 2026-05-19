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
  })
  .transform((env) => ({
    port: env.PORT,
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
