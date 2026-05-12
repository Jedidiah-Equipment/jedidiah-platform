import { AppEnvSchema, type ClientConfig } from "@pkg/schema";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ quiet: true });

if (process.env.APP_ENV === "development") {
  dotenv.config({ path: ".env.dev", override: true, quiet: true });
}

const ServerEnvSchema = z
  .object({
    APP_ENV: AppEnvSchema,
    PORT: z.coerce.number().int().positive().default(7001),
    PUBLIC_APP_BASE_URL: z.url(),
    PUBLIC_API_BASE_URL: z.url(),
    PUBLIC_AUTH_BASE_URL: z.url(),
  })
  .transform((env) => ({
    port: env.PORT,
    clientConfig: {
      appEnv: env.APP_ENV,
      appBaseUrl: env.PUBLIC_APP_BASE_URL,
      apiBaseUrl: env.PUBLIC_API_BASE_URL,
      authBaseUrl: env.PUBLIC_AUTH_BASE_URL,
    },
  }));

export type InjectedClientConfig = z.infer<typeof ClientConfig>;
export type ServerConfig = z.infer<typeof ServerEnvSchema>;

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerEnvSchema.parse(env);
}

export function getInjectedClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): InjectedClientConfig {
  return getServerConfig(env).clientConfig;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  getServerConfig();
}
