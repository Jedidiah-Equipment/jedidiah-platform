import os from 'node:os';
import path from 'node:path';

import {
  AI_REASONING_EFFORTS,
  AppEnv,
  defaultedEnvUrl,
  EnvBoolean,
  NodeEnv,
  OptionalEnvBoolean,
  OptionalEnvString,
} from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// `.env.dev` holds real local-dev service credentials (Resend, OpenAI) and flips
// EMAIL_PROVIDER to `resend`. Tests must never load it, otherwise the email sender
// becomes a live Resend client and the mock-email harness records nothing.
if (process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

// `.env.test` is a gitignored, test-only override (per-worktree TEST_DATABASE_URL).
// It is loaded only under NODE_ENV=test and must carry no real-service credentials.
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: true, quiet: true });
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
export const ApiConfig = z
  .object({
    NODE_ENV: NodeEnv.default('development'),
    APP_ENV: AppEnv,
    DATABASE_URL: z.url(),
    TEST_DATABASE_URL: z.url().optional(),
    APP_BASE_URL: z.url(),
    API_BASE_URL: z.url(),
    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
    AUTH_TRUSTED_ORIGINS: TrustedOrigins,
    EMAIL_PROVIDER: z.enum(['mock', 'resend']).default('mock'),
    EMAIL_FROM: z.string().min(1).default('noreply@jedidiahequipment.co.za'),
    RESEND_API_KEY: z.string().min(1).optional(),
    DOCUMENT_STORAGE_ACCESS_KEY_ID: z.string().min(1),
    DOCUMENT_STORAGE_BUCKET: z.string().min(1),
    DOCUMENT_STORAGE_ENDPOINT: z.url(),
    DOCUMENT_STORAGE_FORCE_PATH_STYLE: EnvBoolean,
    DOCUMENT_STORAGE_REGION: z.string().min(1),
    DOCUMENT_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    // Ephemeral by default; operators can point this at a persistent mount to keep the cache warm.
    API_IMAGE_CACHE_DIR: z.string().min(1).default(path.join(os.tmpdir(), 'jedidiah-api-image-cache')),
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).default('gpt-5.5'),
    OPENAI_REASONING_EFFORT: z.enum(AI_REASONING_EFFORTS).default('low'),
    OPENAI_TRANSLATION_MODEL: z.string().min(1).optional(),
    PORT: z.coerce.number().int().positive().default(7002),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    LOG_DOMAINS_DISABLED: z.string().optional(),
    POSTHOG_ENABLED: OptionalEnvBoolean,
    POSTHOG_PROJECT_TOKEN: OptionalEnvString,
    POSTHOG_HOST: defaultedEnvUrl('https://us.i.posthog.com'),
    RAILWAY_DEPLOYMENT_ID: z.string().min(1).optional(),
    RAILWAY_SNAPSHOT_ID: z.string().min(1).optional(),
    RAILWAY_SERVICE_NAME: z.string().min(1).optional(),
    RAILWAY_ENVIRONMENT_NAME: z.string().min(1).optional(),
    RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
  })
  .transform((config) => ({
    ...config,
    OPENAI_TRANSLATION_MODEL: config.OPENAI_TRANSLATION_MODEL ?? config.OPENAI_MODEL,
  }))
  .superRefine((config, ctx) => {
    if (config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is resend',
        path: ['RESEND_API_KEY'],
      });
    }
  });

export function getApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfig.parse(env);
}
