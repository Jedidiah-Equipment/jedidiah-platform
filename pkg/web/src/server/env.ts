import { getReleaseMetadata, isRemoteAppEnv } from '@pkg/domain';
import {
  AppEnv,
  ClientConfig,
  EnvBoolean,
  POSTHOG_ASSET_HOST,
  POSTHOG_CLIENT_API_HOST,
  POSTHOG_INGEST_HOST,
  POSTHOG_UI_HOST,
} from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

if (process.env.APP_ENV === 'development') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

const POSTHOG_PROXY_ASSET_PATH = '/info/static';

type ServerEnv = z.infer<typeof ServerEnv>;
const ServerEnv = z.object({
  APP_ENV: AppEnv,
  PORT: z.coerce.number().int().positive().default(7001),
  APP_BASE_URL: z.url(),
  API_BASE_URL: z.url(),
  AUTH_BASE_URL: z.url(),
  POSTHOG_ENABLED: EnvBoolean.optional(),
  POSTHOG_PROJECT_TOKEN: z.string().min(1).optional(),
  POSTHOG_INGEST_HOST: z.url().default(POSTHOG_INGEST_HOST),
  POSTHOG_ASSET_HOST: z.url().default(POSTHOG_ASSET_HOST),
  POSTHOG_UI_HOST: z.url().default(POSTHOG_UI_HOST),
  POSTHOG_SOURCEMAPS_ENABLED: EnvBoolean.optional(),
  POSTHOG_API_KEY: z.string().min(1).optional(),
  POSTHOG_PROJECT_ID: z.string().min(1).optional(),
  POSTHOG_SOURCEMAPS_HOST: z.url().default(POSTHOG_UI_HOST),
  RAILWAY_DEPLOYMENT_ID: z.string().min(1).optional(),
  RAILWAY_SNAPSHOT_ID: z.string().min(1).optional(),
  RAILWAY_SERVICE_NAME: z.string().min(1).optional(),
  RAILWAY_ENVIRONMENT_NAME: z.string().min(1).optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfig>;
export const ServerConfig = ServerEnv.superRefine((env, ctx) => {
  const posthogEnabled = env.POSTHOG_ENABLED ?? isRemoteAppEnv(env.APP_ENV);
  const sourcemapsEnabled = env.POSTHOG_SOURCEMAPS_ENABLED ?? posthogEnabled;

  if (posthogEnabled && !env.POSTHOG_PROJECT_TOKEN) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'POSTHOG_PROJECT_TOKEN is required when PostHog is enabled',
      path: ['POSTHOG_PROJECT_TOKEN'],
    });
  }

  if (sourcemapsEnabled && !env.POSTHOG_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'POSTHOG_API_KEY is required when PostHog source maps are enabled',
      path: ['POSTHOG_API_KEY'],
    });
  }

  if (sourcemapsEnabled && !env.POSTHOG_PROJECT_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'POSTHOG_PROJECT_ID is required when PostHog source maps are enabled',
      path: ['POSTHOG_PROJECT_ID'],
    });
  }
}).transform((env) => {
  const release = getReleaseMetadata({
    railwayDeploymentId: env.RAILWAY_DEPLOYMENT_ID ?? null,
    railwayGitCommitSha: env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });

  return {
    port: env.PORT,
    posthogProxy: {
      enabled: env.POSTHOG_ENABLED ?? isRemoteAppEnv(env.APP_ENV),
      apiPath: POSTHOG_CLIENT_API_HOST,
      assetPath: POSTHOG_PROXY_ASSET_PATH,
      ingestHost: env.POSTHOG_INGEST_HOST,
      assetHost: env.POSTHOG_ASSET_HOST,
    },
    posthogSourceMaps: {
      enabled: env.POSTHOG_SOURCEMAPS_ENABLED ?? env.POSTHOG_ENABLED ?? isRemoteAppEnv(env.APP_ENV),
      apiKey: env.POSTHOG_API_KEY ?? null,
      projectId: env.POSTHOG_PROJECT_ID ?? null,
      host: env.POSTHOG_SOURCEMAPS_HOST,
    },
    deployment: {
      appEnv: env.APP_ENV,
      serviceName: env.RAILWAY_SERVICE_NAME ?? null,
      environmentName: env.RAILWAY_ENVIRONMENT_NAME ?? null,
      deploymentId: env.RAILWAY_DEPLOYMENT_ID ?? null,
      snapshotId: env.RAILWAY_SNAPSHOT_ID ?? null,
      commitSha: env.RAILWAY_GIT_COMMIT_SHA ?? null,
    },
    clientConfig: createClientConfig(env, release),
  };
});

export type InjectedClientConfig = ClientConfig;

export function getServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return ServerConfig.parse(env);
}

export function getInjectedClientConfig(env: NodeJS.ProcessEnv = process.env): InjectedClientConfig {
  return getServerConfig(env).clientConfig;
}

function createClientConfig(env: ServerEnv, release: string | null): ClientConfig {
  return ClientConfig.parse({
    appEnv: env.APP_ENV,
    appBaseUrl: env.APP_BASE_URL,
    apiBaseUrl: env.API_BASE_URL,
    authBaseUrl: env.AUTH_BASE_URL,
    deploymentVersion: release,
    posthog: {
      enabled: env.POSTHOG_ENABLED ?? isRemoteAppEnv(env.APP_ENV),
      token: env.POSTHOG_PROJECT_TOKEN,
      apiHost: POSTHOG_CLIENT_API_HOST,
      uiHost: env.POSTHOG_UI_HOST,
      release,
    },
  });
}
