import { getReleaseMetadata } from '@pkg/domain';
import {
  AppEnv,
  ClientConfig,
  defaultedEnvUrl,
  isPostHogEnabled,
  isPostHogSourceMapsEnabled,
  OptionalEnvBoolean,
  OptionalEnvString,
  POSTHOG_ASSET_HOST,
  POSTHOG_CLIENT_API_HOST,
  POSTHOG_INGEST_HOST,
  POSTHOG_UI_HOST,
} from '@pkg/schema';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

// `.env.dev` holds real local-dev service credentials. Tests must never load it,
// or those live values leak into the test process via `override: true`.
if (process.env.APP_ENV === 'development' && process.env.NODE_ENV !== 'test') {
  dotenv.config({ path: '.env.dev', override: true, quiet: true });
}

// `.env.test` is a gitignored, test-only override (per-worktree TEST_DATABASE_URL).
// It is loaded only under NODE_ENV=test and must carry no real-service credentials.
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test', override: true, quiet: true });
}

const POSTHOG_PROXY_ASSET_PATH = '/info/static';

type ServerEnv = z.infer<typeof ServerEnv>;
const ServerEnv = z.object({
  APP_ENV: AppEnv,
  PORT: z.coerce.number().int().positive().default(7001),
  APP_BASE_URL: z.url(),
  API_BASE_URL: z.url(),
  AUTH_BASE_URL: z.url(),
  POSTHOG_ENABLED: OptionalEnvBoolean,
  POSTHOG_PROJECT_TOKEN: OptionalEnvString,
  POSTHOG_INGEST_HOST: defaultedEnvUrl(POSTHOG_INGEST_HOST),
  POSTHOG_ASSET_HOST: defaultedEnvUrl(POSTHOG_ASSET_HOST),
  POSTHOG_UI_HOST: defaultedEnvUrl(POSTHOG_UI_HOST),
  POSTHOG_SOURCEMAPS_ENABLED: OptionalEnvBoolean,
  POSTHOG_API_KEY: OptionalEnvString,
  POSTHOG_PROJECT_ID: OptionalEnvString,
  POSTHOG_SOURCEMAPS_HOST: defaultedEnvUrl(POSTHOG_UI_HOST),
  RAILWAY_DEPLOYMENT_ID: z.string().min(1).optional(),
  RAILWAY_SNAPSHOT_ID: z.string().min(1).optional(),
  RAILWAY_SERVICE_NAME: z.string().min(1).optional(),
  RAILWAY_ENVIRONMENT_NAME: z.string().min(1).optional(),
  RAILWAY_GIT_COMMIT_SHA: z.string().min(1).optional(),
});

export type ServerConfig = z.infer<typeof ServerConfig>;
export const ServerConfig = ServerEnv.transform((env) => {
  const release = getReleaseMetadata({
    railwayDeploymentId: env.RAILWAY_DEPLOYMENT_ID ?? null,
    railwayGitCommitSha: env.RAILWAY_GIT_COMMIT_SHA ?? null,
  });
  const posthogEnabled = isPostHogEnabled(env);
  const posthogSourceMapsEnabled = isPostHogSourceMapsEnabled(env);

  return {
    port: env.PORT,
    posthogProxy: {
      enabled: posthogEnabled,
      apiPath: POSTHOG_CLIENT_API_HOST,
      assetPath: POSTHOG_PROXY_ASSET_PATH,
      ingestHost: env.POSTHOG_INGEST_HOST,
      assetHost: env.POSTHOG_ASSET_HOST,
    },
    posthogSourceMaps: {
      enabled: posthogSourceMapsEnabled,
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
      enabled: isPostHogEnabled(env),
      token: env.POSTHOG_PROJECT_TOKEN,
      apiHost: POSTHOG_CLIENT_API_HOST,
      uiHost: env.POSTHOG_UI_HOST,
      release,
    },
  });
}
