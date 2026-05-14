import { AppEnv, NodeEnv } from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

if (process.env.APP_ENV === 'development') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

export type TrustedOrigins = z.infer<typeof TrustedOrigins>;
export const TrustedOrigins = z
  .string()
  .min(1)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().url()).min(1));

export type ApiConfig = z.infer<typeof ApiConfig>;
export const ApiConfig = z.object({
  NODE_ENV: NodeEnv.default('development'),
  APP_ENV: AppEnv,
  DATABASE_URL: z.url(),
  TEST_DATABASE_URL: z.url().optional(),
  APP_BASE_URL: z.url(),
  API_BASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  AUTH_TRUSTED_ORIGINS: TrustedOrigins,
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.5'),
  PORT: z.coerce.number().int().positive().default(7002),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
  LOG_DOMAINS_DISABLED: z.string().optional(),
});

export function getApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfig.parse(env);
}
