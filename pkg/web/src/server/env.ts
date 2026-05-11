import { type ClientConfig, NodeEnvSchema } from "@pkg/schema";
import { z } from "zod";

const ServerEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(7001),
    PUBLIC_APP_ENV: NodeEnvSchema,
    PUBLIC_APP_BASE_URL: z.string().url(),
    PUBLIC_API_BASE_URL: z.string().url(),
    PUBLIC_AUTH_BASE_URL: z.string().url(),
  })
  .transform((env) => ({
    port: env.PORT,
    clientConfig: {
      appEnv: env.PUBLIC_APP_ENV,
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
