import { isRemoteAppEnv } from '@pkg/domain';
import { AppEnv, EnvBoolean, NodeEnv } from '@pkg/schema';
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
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).default('gpt-5.5'),
    OPENAI_REASONING_EFFORT: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']).default('low'),
    PORT: z.coerce.number().int().positive().default(7002),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    LOG_DOMAINS_DISABLED: z.string().optional(),
    POSTHOG_ENABLED: EnvBoolean.optional(),
    POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
    POSTHOG_HOST: z.string().url().default('https://us.i.posthog.com'),
    RAILWAY_DEPLOYMENT_ID: z.string().min(1).optional(),
    RAILWAY_SNAPSHOT_ID: z.string().min(1).optional(),
    RAILWAY_SERVICE_NAME: z.string().min(1).optional(),
    RAILWAY_ENVIRONMENT_NAME: z.string().min(1).optional(),
    RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
  })
  .superRefine((config, ctx) => {
    if (config.EMAIL_PROVIDER === 'resend' && !config.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER is resend',
        path: ['RESEND_API_KEY'],
      });
    }

    const posthogEnabled = config.POSTHOG_ENABLED ?? isRemoteAppEnv(config.APP_ENV);
    if (posthogEnabled && !config.POSTHOG_PROJECT_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'POSTHOG_PROJECT_TOKEN is required when PostHog is enabled',
        path: ['POSTHOG_PROJECT_TOKEN'],
      });
    }
  });

export function getApiConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return ApiConfig.parse(env);
}
